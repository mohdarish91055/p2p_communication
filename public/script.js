let callTimerInterval;
let secondsElapsed = 0;
let usingFrontCamera = true;

function startCallTimer() {
  secondsElapsed = 0;
  const timerElem = document.getElementById("callTimer");
  timerElem.style.display = "inline";
  timerElem.textContent = "00:00";

  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = Math.floor(secondsElapsed / 60)
      .toString()
      .padStart(2, "0");
    const secs = (secondsElapsed % 60).toString().padStart(2, "0");
    timerElem.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  const timerElem = document.getElementById("callTimer");
  timerElem.style.display = "none";
  secondsElapsed = 0;
}

const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCamera = document.getElementById("startCamera");
const flipCameraBtn = document.getElementById("flipCameraBtn");
const joinRoomBtn = document.getElementById("joinRoom");
const roomIdInput = document.getElementById("roomId");
const statusText = document.getElementById("status");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendMsgBtn = document.getElementById("sendMsgBtn");

let localStream;
let peerConnection;
let remoteSocketId;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// 1. Start Camera
startCamera.addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
    localVideo.srcObject = localStream;
    statusText.textContent = "Camera active. Enter Room ID & join.";
    startCamera.style.display = "none";
    flipCameraBtn.style.display = "inline-block";
    muteBtn.style.display = "inline-block";
    cameraBtn.style.display = "inline-block";
  } catch (error) {
    console.error("Media error:", error);
    statusText.textContent = "Camera error: " + error.name;
  }
});

// Flip Camera (Front / Rear)
flipCameraBtn.addEventListener("click", async () => {
  if (!localStream) return;
  usingFrontCamera = !usingFrontCamera;

  try {
    // Stop current video track
    localStream.getVideoTracks().forEach((track) => track.stop());

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: usingFrontCamera ? "user" : "environment" },
      audio: true,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    // Replace track in localStream
    const oldVideoTrack = localStream.getVideoTracks()[0];
    localStream.removeTrack(oldVideoTrack);
    localStream.addTrack(newVideoTrack);
    localVideo.srcObject = localStream;

    // If connected in a call, update the peer connection track as well
    if (peerConnection) {
      const sender = peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender) {
        sender.replaceTrack(newVideoTrack);
      }
    }
  } catch (err) {
    console.error("Error flipping camera:", err);
  }
});

// 2. Join Room
joinRoomBtn.addEventListener("click", () => {
  const roomId = roomIdInput.value.trim();
  if (!localStream) {
    alert("Please click 'Start Camera' first!");
    return;
  }
  if (!roomId) {
    alert("Please enter a Room ID!");
    return;
  }
  socket.emit("join-room", roomId);
  disconnectBtn.style.display = "inline-block";
});

// 3. Create Peer Connection
function createPeerConnection(targetSocketId) {
  remoteSocketId = targetSocketId;
  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        target: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "connected") {
      statusText.textContent = "Connected!";
      startCallTimer();
    } else if (
      peerConnection.connectionState === "disconnected" ||
      peerConnection.connectionState === "failed" ||
      peerConnection.connectionState === "closed"
    ) {
      statusText.textContent = "Disconnected.";
      resetCallState();
    }
  };
}

// Socket Signaling Events
socket.on("waiting", (msg) => {
  statusText.textContent = msg;
});

socket.on("room-joined", async (existingUserId) => {
  statusText.textContent = "Connecting...";
  createPeerConnection(existingUserId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { target: existingUserId, offer });
});

socket.on("user-joined", (newUserId) => {
  statusText.textContent = "User joined! Waiting...";
  remoteSocketId = newUserId;
});

socket.on("offer", async ({ sender, offer }) => {
  createPeerConnection(sender);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { target: sender, answer });
  statusText.textContent = "Connected!";
});

socket.on("answer", async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  statusText.textContent = "Connected!";
});

socket.on("ice-candidate", async ({ candidate }) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// 4. Chat Messages
sendMsgBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text || !remoteSocketId) return;

  socket.emit("send-message", { target: remoteSocketId, message: text });
  appendMessage("You: " + text, "outgoing");
  messageInput.value = "";
});

socket.on("receive-message", ({ sender, message }) => {
  appendMessage("Peer: " + message, "incoming");
});

function appendMessage(text, className) {
  const div = document.createElement("div");
  div.className = `chat-message ${className}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 5. Disconnect
disconnectBtn.addEventListener("click", () => {
  socket.emit("leave-room");
  resetCallState();
  statusText.textContent = "Call ended.";
});

socket.on("user-left", () => {
  statusText.textContent = "Remote user disconnected.";
  resetCallState();
});

socket.on("error-message", (msg) => {
  alert(msg);
});

// 6. Mute & Camera Toggle
muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
});

cameraBtn.addEventListener("click", () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.textContent = videoTrack.enabled ? "Cam Off" : "Cam On";
});

function resetCallState() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  disconnectBtn.style.display = "none";
  remoteSocketId = null;
  stopCallTimer();
}
