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

let lastclient;
// setup app
app.use(express.static(path.join(__dirname,"public")));
server.listen(PORT,()=>console.log(`server running on port ${PORT}`));

// ------- socket setup -------

// when a new client connects:
io.on('connection',socket=>{

  lastclient = socket;
  console.log("client connected to server");
  // set up listeners for this client:

  // example message
  socket.on("messagefromclient",msg=>{

  });


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
    SaveUserInput(data, socket);
  });


  // message to all:
  // socket.broadcast.emit("header","mssage");

  // answer something to confirm connection
  socket.emit("messagefromserver","hi, client!");



});


// ------- mongo setup -------


const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_queryurl;
const mongoclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


// SaveUserInput()
//
// send user input to mongo

function SaveUserInput(txt, socket){

  mongoclient.connect(err => {

    addThing(txt,socket);

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

         // Find one document
        // const myDoc = await col.findOne();
         // Print to the console
        // console.log(myDoc);

        // send response if specified
        if(response!=undefined)
          socket.emit(response.header,response.message);
        } catch (err) {
         console.log(err.stack);
         if(failresponse!=undefined)
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
      profanityFilter: true,
      enableWordTimeOffsets: false
    },
    interimResults: true
  }
}
