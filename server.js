const express = require("express");
const path = require("path");
const http = require("http");
const environmentVars = require('dotenv').config();
const PORT = process.env.PORT || 3000;
const socketio = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = socketio(server);
// mongo
const dbName = process.env.MONGO_dbname;
const queryurl = process.env.MONGO_queryurl;
// gcloud
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient({
  projectId: process.env.PROJECT_ID,
  credentials: {
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(new RegExp('\\\\n', '\g'), '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL
  }
});
let recognizeStream = null;
const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
let languageCode = 'en-US'; //en-US
let alternativeLanguageCodes = ['en-US', 'fr-CA'];

// rita
let RiTa = require('rita');
let rm = new RiTa.markov(2);
let markovready=false;
let all_phrases = [];
let all_gen_phrases = [];


// setup app
app.use(express.static(path.join(__dirname,"public")));
server.listen(PORT,()=>console.log(`server running on port ${PORT}`));



// ------- socket setup -------

// when a new client connects:
io.on('connection',socket=>{

  console.log("client connected to server");

  let thingssaid = [];
  // set up listeners for this client:
  // example message
  // socket.on("messagefromclient",msg=>{});
  // message to all:
  // socket.broadcast.emit("header","mssage");


  //
  // mic input start
  socket.on('startGoogleCloudStream', data=>{
      console.log("opened mic on front-end");
      startRecognitionStream(this);
  });


  // on stream-over request from front end
  socket.on('endGoogleCloudStream', ()=>{
    console.log("closed mic on front-end");
    stopRecognitionStream();
  });


  // on receiving a chunk of audio from front-end
  socket.on('binaryData', data=>{
    if (recognizeStream !== null) {
      process.stdout.write("."); // print a dot in the console
      recognizeStream.write(data);
    }
  });

  // on receiving final text from front-end
  socket.on("InputFieldData", data=>{
    all_phrases.push(data);
    thingssaid.push(data);
    // send to mongo
    SaveUserInput(data, socket);
    // add to RiTa buffer
    rm.addText(data);

    // grab the first 5 or less words
    let counter =0;
    let input = "";
    data.split(" ").forEach(word=>{
      if(counter<5) input += word + " ";
      counter++;
    });

    // generate a phrase from that
    getrita(input);
  });


  socket.on("RequestPrompt",()=>{

    let pick = Math.floor(Math.random()*all_phrases.length);
    let randomsaying = all_phrases[pick];

    //console.log(pick);
    //console.log(thingssaid);
    while(thingssaid.length!=all_phrases.length&&thingssaid.includes(randomsaying)){
      pick = Math.floor(Math.random()*all_phrases.length);
      randomsaying = all_phrases[pick];
    }


      socket.emit("PromptResponse",randomsaying);
  });

  // answer something to confirm connection
  socket.emit("messagefromserver","hi, client!");



});


// ------- mongo setup -------


const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_queryurl;
const mongoclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function GetMongoDataOnStart(){
  try {
    await mongoclient.connect();
    const database = mongoclient.db(process.env.MONGO_dbname);
    const collection = database.collection("all_sayings");

    const query = {};
    const options = {
      // sort returned documents in ascending order by title (A->Z)
      sort: { title: 1 }
    };
    const cursor = collection.find(query, options);
    // print a message if no documents were found
    if ((await cursor.count()) === 0) {
      console.log("No documents found!");
    }
    // replace console.dir with your callback to access individual elements
    await cursor.forEach(doc=>{
      console.log(doc);
      rm.addText(doc.body);
      all_phrases.push(doc.body);
    });
  } finally {
    await mongoclient.close();
  }
}

GetMongoDataOnStart();

// SaveUserInput()
//
// send user input to mongo

function SaveUserInput(txt, socket){

  mongoclient.connect(err => {
    addThing(txt,socket);
  });
}

function SaveGeneratedInput(txt,socket){

  mongoclient.connect(err =>{
    dbADD(
      "all_sayings",
      {body:txt,time:"today"},
      undefined,
      {header:"server_response",message:"success"},
      {header:"server_response",message:"failure"}).catch(console.dir);
  });
}


// addThing()
//
// send something to mongo server
async function addThing(txt,socket){

  dbADD(
    "all_sayings",
    {body:txt,time:"today"},
    socket,
    {header:"server_response",message:"success"},
    {header:"server_response",message:"failure"}).catch(console.dir);
}


// function run()
//
// places a new data element in the mongo database.
async function dbADD(collectionName,data,socket,response,failresponse) {
    try {
        // await client.connect();
         console.log("Connected correctly to server");
         const db = mongoclient.db(dbName);
         // Use the collection "people"
         const col = db.collection(collectionName);

         // Insert a single document, wait for promise so we can read it back
         const p = await col.insertOne(data);

        // send response if specified
        if(socket!=undefined){
          if(response!=undefined)
            socket.emit(response.header,response.message);
        }

        } catch (err) {
         console.log(err.stack);
         if(failresponse!=undefined&&socket!=undefined)
          socket.emit(failresponse.header,failresponse.message);
        }

     finally {
      mongoclient.close();
    }
}






// startRecognitionStream()
//
// Start streaming mic data to gcloud, and listen for the
// transcript data that comes back.

function startRecognitionStream(tempclient) {
  console.log("started streaming mic data to gcloud");

  // set language here
  languageCode = 'en-US';

  // listened for incoming data
  recognizeStream = speechClient
  .streamingRecognize(GetRequest())
  .on('error', console.error)
  // handler function for data coming in from g-cloud.
  .on('data', (data) => {

    // relay the current best transcript to front-end
    if(tempclient!=undefined)
      tempclient.emit('SpeechData', data.results[0].alternatives[0].transcript);


    // if end of utterance, let's stop the stream
    if (data.results[0] && data.results[0].isFinal) {

      // the final string:
      tempclient.emit('FinalSpeechData', data.results[0].alternatives[0].transcript);

      stopRecognitionStream();
    }

  });
}


function stopRecognitionStream() {
  console.log("stopping streaming mic data to gcloud")
  if (recognizeStream!=null) {
    recognizeStream.end();
    console.log("stream stopped. ")
  }
  recognizeStream = null;
}

// GetRequest()
//
// audio stream setup. called whenever a stream starts
// (in startRecognitionStream)
function GetRequest(){
  return {
    config: {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      alternativeLanguageCodes: alternativeLanguageCodes,
      profanityFilter: true,
      enableWordTimeOffsets: false
    },
    interimResults: true
  }
}





/// *** Rita

async function getrita(inputText){

  try{

    let opts = {};
    if(inputText!=undefined){
      opts = {seed:inputText};
    }
    // generate a phrase
    let r = await rm.generate(1, opts);
    console.log("generating something with rita");
    console.log("result: " + r);


    // if we successfully generated something
    if(r!=undefined&&r!=false&&r!=""){


      // add to list of generated words
      // saveGeneratedPhrase(r);
      if(!all_phrases.includes(r[0])){
        // save
        all_gen_phrases.push(r[0]);
        // send to mongooo
        SaveGeneratedInput(r[0]);
        // add to rita buffer???
        rm.addText(r[0]);
      }


    }
    // if we got busted results?
    else{
      console.log(";(");
    }

    // if the result is a fail message
    // usually means there's not enough text to generate new
  }
  catch(error){
    console.log("\nrita failed!")
    console.log(error);

    // if we use a phrase prompt for input,
    // try without a prompt instead
    if(inputText!=undefined) getrita();
    return false;
  }
}
