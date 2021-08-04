/*
recording.js
here we find functions to start & stop recording,
functions that update the record button,
& a function that streams audio to backend during the recording
*/

// initRecording()
//
// called in RecordButtonPressed (script.js)

function initRecording() {

  // update interface
  AnimateRecordButton();

  // start recording

  socket.emit('startGoogleCloudStream', ''); //init socket Google Speech Connection
  streamStreaming = true;

  AudioContext = window.AudioContext || window.webkitAudioContext;
  context = new AudioContext({
    // if Non-interactive, use 'playback' or 'balanced' // https://developer.mozilla.org/en-US/docs/Web/API/AudioContextLatencyCategory
    latencyHint: 'interactive',
    noiseSuppression: useNoiseSuppression
  });

  processor = context.createScriptProcessor(bufferSize, 1, 1);
  processor.connect(context.destination);
  context.resume();

  var handleSuccess = function (stream) {
    globalStream = stream;
    input = context.createMediaStreamSource(stream);
    input.connect(processor);
    console.log("connected!")
    processor.onaudioprocess = function (e) {
      microphoneProcess(e);
    };
  };

  navigator.mediaDevices.getUserMedia({audio:true,video:false}).then(handleSuccess);
}

// microphoneProcess()
//
// process latest chunk of audio and send to server.

function microphoneProcess(e) {

  let data = e.inputBuffer.getChannelData(0);
  let left16 = downsampleBuffer(data, 44100, 16000);
  socket.emit('binaryData', left16);
}


// stopRecording()
//
// called in RecordButtonPressed (script.js)

function stopRecording() {

  // update interface
  ResetRecordButton();

  // stop recording
  streamStreaming = false;
  socket.emit('endGoogleCloudStream', '');

  let track = globalStream.getTracks()[0];
  track.stop();

  input.disconnect(processor);
  processor.disconnect(context.destination);
  context.close().then(function () {
    input = null;
    processor = null;
    context = null;
    AudioContext = null;
  });
}


// AnimateRecordButton()
//
// animates record button during recording

function AnimateRecordButton(){
  temptext="";
  let button = document.getElementById("TopButton");
  button.classList.add("Recording");

  recordAnim=setInterval(function(){
    if(temptext=="...") temptext="";
    temptext+=".";
    button.value=temptext;
  }, 300 );
}


// ResetRecordButton()
//
// set record button back to its initial state

function ResetRecordButton(){
  clearInterval(recordAnim);
  let button = document.getElementById("TopButton");
  button.classList.remove("Recording");
  button.value = recordButtonText;
}


// downsamplebuffer()
//
// used to format audio before emitting via sockets

var downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
  if (outSampleRate == sampleRate) {
    return buffer;
  }
  if (outSampleRate > sampleRate) {
    throw 'downsampling rate show be smaller than original sample rate';
  }
  var sampleRateRatio = sampleRate / outSampleRate;
  var newLength = Math.round(buffer.length / sampleRateRatio);
  var result = new Int16Array(newLength);
  var offsetResult = 0;
  var offsetBuffer = 0;
  while (offsetResult < result.length) {
    var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    var accum = 0,
    count = 0;
    for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = Math.min(1, accum / count) * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result.buffer;
};
