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

// start()
//
// triggered on page load
function start(){

  socketIOSetup();

  recordButton = document.getElementById("TopButton");
  recordButtonText= recordButton.value;
  inputField = document.getElementById("TextInput");

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

  // send a test message
  socket.emit("messagefromclient","i just joined wazaa");
}


function RecordButtonPressed(){

  if(!recordingInProgress) initRecording();
  else stopRecording();

  recordingInProgress = !recordingInProgress;
}

function SendButtonPressed(){
  let txt = inputField.value;

  socket.emit("InputFieldData", txt);

  inputField.value = "";
}
