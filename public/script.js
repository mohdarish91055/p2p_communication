const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCamera = document.getElementById("startCamera");
const joinRoomBtn = document.getElementById("joinRoom");
const roomIdInput = document.getElementById("roomId");
const statusText = document.getElementById("status");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

let localStream;
let peerConnection;
let remoteSocketId;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// 1. Start Camera & Microphone
startCamera.addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
    localVideo.srcObject = localStream;
    statusText.textContent = "Camera started. Enter Room ID and click Join.";
    startCamera.style.display = "none"; // Hide after starting
  } catch (error) {
    console.error("Media access error:", error);
    statusText.textContent = "Error: " + error.name;
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
}

// Socket Signaling Events
socket.on("waiting", (msg) => {
  statusText.textContent = msg;
});

socket.on("room-joined", async (existingUserId) => {
  statusText.textContent = "Connecting to user...";
  createPeerConnection(existingUserId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { target: existingUserId, offer });
});

socket.on("user-joined", (newUserId) => {
  statusText.textContent = "User joined! Waiting for connection...";
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

// 4. Disconnect Logic
disconnectBtn.addEventListener("click", () => {
  hangUp();
});

socket.on("user-left", () => {
  statusText.textContent = "Remote user disconnected.";
  resetCallState();
});

socket.on("error-message", (msg) => {
  alert(msg);
});

function hangUp() {
  socket.emit("leave-room");
  resetCallState();
  statusText.textContent = "Call ended.";
}

function resetCallState() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  disconnectBtn.style.display = "none";
}

// 5. Mute & Camera Controls
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
  cameraBtn.textContent = videoTrack.enabled
    ? "Turn Camera Off"
    : "Turn Camera On";
});
