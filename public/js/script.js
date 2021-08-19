window.onload = start;

// socket.io
let socket;

// recording
let bufferSize = 2048,
AudioContext,
context,
processor,
input,
globalStream;
let recordingInProgress = false;
useNoiseSuppression=true;
// audio streaming
let audioElement = document.querySelector('audio'),
finalWord = false,
streamStreaming = false;

// record button animation
let recordButtonText; // initial text (set it in index.html)
let temptext;
let recordAnim;

let recordButton;
let inputField;
let fieldval = "";

// start()
//
// triggered on page load
function start(){

  socketIOSetup();

  recordButton = document.getElementById("TopButton");
  recordButtonText= recordButton.value;
  inputField = document.getElementById("TextInput");
  fieldval = inputField.innerHTML;

  document.body.onclick = checkfocus;

  requestPrompt();
}

let fieldfocused = false;

function checkfocus(){
  let chk = inputField==document.activeElement;
  if(!fieldfocused&&chk){
    fieldfocused = true;
    inputFieldClicked();
  }
  else if (fieldfocused&&!chk){
    fieldfocused = false;
    inputFieldUnFocused ();
  }
}


function inputFieldClicked (){
  if(inputField.innerHTML==fieldval){
    inputField.innerHTML = "";
  }

  if(inputField.value==fieldval){
    inputField.value = "";
  }
}

function inputFieldUnFocused (){
  if(inputField.innerHTML==""&&inputField.value=="")
  inputField.value = fieldval;
}

function requestPrompt(){
  console.log("Requested prompt");
  socket.emit("RequestPrompt", "please");
}

// socketIOSetup()
//
// connect to socket io and setup listeners
function socketIOSetup(){
  // start connection
  socket = io();

  // set listeners
  socket.on("messagefromserver", msg=>{
    console.log("server said: "+msg);
  });

  socket.on("SpeechData", msg=>{
    console.log("Latest Best Transcript: "+msg);
    inputField.value = msg;
  });

  socket.on("FinalSpeechData", msg=>{
    console.log("Final Transcript: "+msg);
    ResetRecordButton();
    inputField.value = msg;
  });


  socket.on("PromptResponse", msg=>{
    console.log("Received prompt: "+msg);
    document.getElementById("prompt_text_output").innerHTML = msg;
  });

  socket.on("ProfanityDetectionResponse", msg=>{
    console.log("Submission contains profanity: "+msg);
    ProfanityDetectionModal(msg);
  });
  // send a test message
  socket.emit("messagefromclient","i just joined wazaa");
}




function RecordButtonPressed(lang){
  if(!recordingInProgress) initRecording(lang);
  else stopRecording();

  //recordingInProgress = !recordingInProgress;
}

function SendButtonPressed(){
  let txt = inputField.value;

  socket.emit("ProfanityDetection", txt);
}

function ProfanityDetectionModal(profanityDetected){
  if(profanityDetected){
    document.getElementById("profanity_modal").style.display = "block";
  }else{
    SendSubmission();
  }
}

function SendSubmission(){
  document.getElementById("profanity_modal").style.display = "none";
  let txt = inputField.value;
  socket.emit("InputFieldData", txt);
  inputField.value = "";
  document.getElementById("success_modal").style.display = "block";
}

function CloseModal(id){
  document.getElementById(id).style.display = "none";
}
