import {WebSpeakClient} from "./api/WebspeakClient.ts";
import type {WebspeakConfig} from "./api/WebspeakConfig.ts";
import {AudioSource} from "./api/AudioSource.ts";

//TODO: I forgot to add the speaking animation to player profiles. my bad. This can still be done.
class AudioProfile{
    public audioId: number | null | undefined;
    private readonly _html: HTMLDivElement;
    private readonly _muteButton: HTMLButtonElement;
    private readonly _volumeSlider: HTMLInputElement;
    private readonly audioSourceMap: Map<number, AudioSourceWrapper>;
    constructor(audioSourceMap: Map<number, AudioSourceWrapper>, public readonly uid: string, audioId: number | null | undefined, public readonly name: string){
        this.audioSourceMap = audioSourceMap;
        this.audioId = audioId;

        const card = document.createElement("div");
        card.className = "player-card";

        let initials = "?"
        if(name && name.length > 0) {
            initials = name
                .substring(0, Math.min(name.length, 2))
                .toUpperCase();
        }

        card.innerHTML = `<div class="player-avatar">
                            ${initials}
                        </div>

                        <div class="player-info">
                            <div class="player-name">${name}</div>
                            <div class="player-status">
                                <span class="player-status-dot"></span>
                                Connected
                            </div>
                        </div>

                        <span class="volume-label">Volume</span>

                        <div class="player-controls">
                            <div class="volume-slider-wrap">
                                <div class="volume-slider-bg"></div>

                                <input
                                        type="range"
                                        class="player-volume"
                                        min="0"
                                        max="200"
                                        value="100"
                                        aria-label="Volume for ${name}"
                                >
                            </div>

                            <button class="player-mute-btn" title="Mute ${name}">
                                <svg class="player-mic-icon" width="18" height="18" viewBox="0 0 24 24"
                                     fill="none" stroke="currentColor" stroke-width="2"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    <path class="mic-body" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path class="mic-stand" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line class="mic-line" x1="12" y1="19" x2="12" y2="23"></line>
                                    <line class="mic-base" x1="8" y1="23" x2="16" y2="23"></line>

                                    <!-- hidden until muted -->
                                    <line class="mic-slash" x1="4" y1="4" x2="20" y2="20"></line>
                                </svg>
                            </button>
                        </div>`;

        const muteButton = card.getElementsByClassName("player-mute-btn")[0] as HTMLButtonElement;

        muteButton.addEventListener("click", () => {
            muteButton.classList.toggle("active");
            const source = this.connectedSource();
            if (source) {
                if (this.muted) {
                    source.mute();
                } else {
                    source.unmute();
                }
            }
        });

        this._muteButton = muteButton;

        const volumeInput = card.getElementsByTagName("input")[0];

        volumeInput.addEventListener("change", () => {
            const source = this.connectedSource();
            if (source) {
                source.gain = this.gain;
            }
        });

        this._volumeSlider = volumeInput;

        this._html = card;
    }

    public get html(): HTMLDivElement{
        return this._html;
    }

    public get muted(): boolean{
        return this._muteButton.classList.contains("active");
    }

    public get gain(): number{
        return this._volumeSlider.valueAsNumber / 100.0;
    }

    public connectedSource(): AudioSourceWrapper | undefined {
        if(this.audioId){
            const source = this.audioSourceMap.get(this.audioId);
            if(source){
                return source;
            }
        }
        return undefined;
    }
}

class AudioSourceWrapper{
    private readonly _panner: PannerNode;
    private readonly _gainNode: GainNode;

    private _gain: number = 1.0;
    private _muted: boolean = false;
    private mediaSource?: MediaStreamAudioSourceNode;
    // ADD THIS: Keep a reference to a dummy audio element
    private _dummyAudio?: HTMLAudioElement;
    constructor(ctx: AudioContext, outNode: AudioNode, public readonly source: AudioSource) {
        const panner = new PannerNode(ctx, {
            coneInnerAngle: 360,
            coneOuterAngle: 0,
            coneOuterGain: 0,
            distanceModel: "inverse",
            maxDistance: 26,
            panningModel: "HRTF",
            refDistance: 1,
            rolloffFactor: 1,
        });

        if(source.pos){
            panner.positionX.value = source.pos.x;
            panner.positionY.value = source.pos.y;
            panner.positionZ.value = source.pos.z;
        }

        source.onTrackUpdated.addListener((track) => {
            if(track){
                this.mediaSource?.disconnect();

                if (!track) {
                    this.mediaSource = undefined;
                    this._dummyAudio = undefined; // Cleanup
                    return;
                }

                const stream = new MediaStream([track]);

                this._dummyAudio = new Audio();
                this._dummyAudio.muted = true;
                this._dummyAudio.style.display = "none"; // Hide it
                document.body.appendChild(this._dummyAudio); // MOBILE FIX: Attach to DOM

                this._dummyAudio.srcObject = stream;
                // Handle the play promise so mobile doesn't throw unhandled rejections
                this._dummyAudio.play().catch(e => console.warn("Dummy audio play blocked by mobile autoplay rules", e));

                this.mediaSource = ctx.createMediaStreamSource(stream);
                this.mediaSource.connect(this._panner);
            }
            else{
                this.mediaSource?.disconnect();
                this._dummyAudio = undefined; // Cleanup
            }
        });

        source.onPositionUpdated.addListener((event) => {
            this._panner.positionX.value = event.pos.x;
            this._panner.positionY.value = event.pos.y;
            this._panner.positionZ.value = event.pos.z;
            if(event.rot){
                setPannerOrientationFromEuler(this._panner, event.rot.x, event.rot.y, event.rot.z);
            }
        })

        this._gainNode = ctx.createGain();
        this._gainNode.connect(outNode);
        panner.connect(this._gainNode);
        this._panner = panner;
    }

    public get panner(): PannerNode {
        return this._panner;
    }

    public get muted(): boolean{
        return this._muted;
    }

    public async setOutputDevice(deviceId: string) {
        // Modern browsers support setSinkId on HTMLAudioElement
        if (this._dummyAudio && typeof (this._dummyAudio as any).setSinkId === "function") {
            await (this._dummyAudio as any).setSinkId(deviceId);
        }
    }

    public disconnect():void{
        this.mediaSource?.disconnect();
        this._gainNode.disconnect();
        this._panner.disconnect();

        if (this._dummyAudio) {
            this._dummyAudio.pause();
            this._dummyAudio.srcObject = null;
            this._dummyAudio.remove(); // MOBILE FIX: Remove from DOM
            this._dummyAudio = undefined;
        }
    }

    public mute():void{
        this._muted = true;
        this._gainNode.gain.value = 0;
    }

    public unmute():void{
        this._muted = false;
        this._gainNode.gain.value = this._gain;
    }

    public set gain(value: number){
        this._gain = value;
        if(!this._muted){
            this._gainNode.gain.value = this._gain;
        }
    }
}

class MicContainer{
    private _muted: boolean = false;
    private _gain: number = 1.0;

    public ctx?: AudioContext;
    private _micStream?: MediaStream;
    private _micSource?: MediaStreamAudioSourceNode;
    private _micGain?: GainNode;
    private _analyser?: AnalyserNode;
    private _analyserData?: Uint8Array<ArrayBuffer>;

    private _micDestination?: MediaStreamAudioDestinationNode;

    public get processedTrack(): MediaStreamTrack | undefined {
        return this._micDestination?.stream.getAudioTracks()[0];
    }

    public get muted(): boolean {
        return this._muted;
    }

    public set muted(muted: boolean) {
        this._muted = muted;
        this.updateMuteStateTracks();
    }

    public get micStream(){
        return this._micStream;
    }

    public get gain(): number{
        return this._gain;
    }

    public set gain(gain: number){
        this._gain = gain;
        if(this._micGain){
            this._micGain.gain.value = this._gain;
        }
    }

    public async init(){
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
    }

    public async requestMic(cancelEcho: boolean, noiseSuppress: boolean, autoGain: boolean, deviceId?: string):Promise<MediaStream> {
        if(this.ctx === undefined){
            throw new Error("ctx not set");
        }

        if (this._micStream) {
            this._micStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            audio: {
                echoCancellation: cancelEcho,
                noiseSuppression: noiseSuppress,
                autoGainControl: autoGain,
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}) // Apply specific device if selected
            },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this._micStream = stream;
        if (this.ctx.state === "suspended") await this.ctx.resume();
        if (this._micSource) this._micSource.disconnect();
        this._micSource = this.ctx.createMediaStreamSource(stream);
        this._micGain = this.ctx.createGain();
        this._micGain.gain.value = this._gain;
        this._analyser = this.ctx.createAnalyser();
        this._analyser.fftSize = 256;
        this._analyserData = new Uint8Array(this._analyser.frequencyBinCount);
        this._micDestination = this.ctx.createMediaStreamDestination();
        this._micSource.connect(this._micGain);
        this._micGain.connect(this._analyser);
        this._micGain.connect(this._micDestination);

        this.updateMuteStateTracks();

        return stream;
    }

    public readMicLevel(): number {
        if (!this._analyser || !this._analyserData) return 0;
        this._analyser.getByteFrequencyData(this._analyserData);
        let sum = 0;
        for (let i = 0; i < this._analyserData.length; i++) sum += this._analyserData[i];
        return Math.min(1, (sum / this._analyserData.length) / 130);
    }

    private updateMuteStateTracks(){
        if(this._micStream){
            this._micStream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
        }
        if (this._micDestination) {
            this._micDestination.stream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
        }
    }
}

const params: URLSearchParams = new URLSearchParams(window.location.search);
const sessionParam: string | null = params.get("id");
const relayParam: string | null = params.get("relay");
const relay: URL = relayParam ? new URL(relayParam+"/join") : new URL("wss://webspeak.betrayd.net/join");

const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioCtx = new AudioContextClass();
const masterGainNode = audioCtx.createGain();
masterGainNode.connect(audioCtx.destination);

let client: WebSpeakClient | undefined;
let awaitMic: boolean = false;

let micInput: MicContainer = new MicContainer();

const audioSources: Map<number, AudioSourceWrapper> = new Map<number, AudioSourceWrapper>();
const audioProfiles: Map<string, AudioProfile> = new Map();

const listener = audioCtx.listener;

function start(relayURL: URL, sessionId: string): void{


    const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    const config: WebspeakConfig = {
        relayURL: relayURL,
        sessionId: sessionId,
        rtcConfiguration: rtcConfig,
        retryAttempts: 10
    };
    const thisClient = new WebSpeakClient(config);
    client = thisClient;

    thisClient.onFatalError.addListener((err) => {
        let errorText: string = "An unknown error occurred";
        if(err instanceof Error) {
            errorText = err.message;
        }

        setConnectionStatus(2);
        showError(errorText);
    })

    thisClient.onReady.addListener(() => {
        if(micInput.micStream !== undefined && micInput.processedTrack){
            awaitMic = false;
            setMicSource(micInput.processedTrack);
        }else{
            awaitMic = true;
        }
    })

    thisClient.onConnected.addListener(() => {
        setConnectionStatus(0);
    });

    thisClient.onConnecting.addListener(() => {
        setConnectionStatus(1);
    });

    thisClient.onConnectionReset.addListener(() => {
        for(const prof in audioProfiles){
            audioProfiles.get(prof)?.html.remove();
        }
        for(const [_key, src] of audioSources){
            src.disconnect();
        }
        audioProfiles.clear();
        audioSources.clear();
    });

    thisClient.onLocalPositionUpdated.addListener((event) => {
        listener.positionX.value = event.pos.x;
        listener.positionY.value = event.pos.y;
        listener.positionZ.value = event.pos.z;

        if(event.rot){
            setListenerOrientationFromEuler(listener, event.rot.x, event.rot.y, event.rot.z);
        }
    });

    thisClient.onAudioSourceAdded.addListener((source: AudioSource) => {
        const wrapper = new AudioSourceWrapper(audioCtx, masterGainNode, source);
        for(const [_key, prof] of audioProfiles){
            if(prof.audioId === source.id){
                if(prof.muted){
                    wrapper.mute();
                }
                wrapper.gain = prof.gain;

                break;
            }
        }
        audioSources.set(source.id, wrapper);
    });

    thisClient.onAudioSourceRemoved.addListener((source) => {
        const wrapper = audioSources.get(source.id);
        if(wrapper){
            wrapper.disconnect();
        }
        audioSources.delete(source.id);
    });

    thisClient.onAudioProfileAdded.addListener((event) => {
        const prof: AudioProfile = new AudioProfile(audioSources, event.uid, event.id, event.name);
        audioProfiles.set(event.uid, prof);

        addPlayerProf(prof);
    });

    thisClient.onAudioProfileUpdated.addListener((event) => {
        const prof = audioProfiles.get(event.uid);
        if(prof){
            prof.audioId = event.id;
        }else{
            console.warn(`Could not find audio profile to update for ${event.uid}`);
        }
    })

    thisClient.onAudioProfileRemoved.addListener((event) => {
        const prof = audioProfiles.get(event.uid);
        if(prof){
            prof.html.remove();
            audioProfiles.delete(event.uid);
        }else{
            console.warn(`Could not find audio profile to remove for ${event.uid}`);
        }
    });

    thisClient.start();
}

function setMicSource(track: MediaStreamTrack){
    client?.setMic(track).then(
        () => {
            console.log("Set mic stream to current microphone");
        },
        (reason) => {
            console.error("failed to set mic", reason);
        });
}

/**
 * Set AudioListener orientation from Euler angles.
 *
 * Assumes:
 * - Euler order: Yaw (Y), Pitch (X), Roll (Z)
 * - Right-handed coordinate system
 * - Default forward direction is -Z
 * - Up direction is +Y
 *
 * @param listener The Web Audio API AudioListener
 * @param pitch Rotation around X axis (radians)
 * @param yaw Rotation around Y axis (radians)
 * @param roll Rotation around Z axis (radians)
 */
export function setListenerOrientationFromEuler(
    listener: AudioListener,
    pitch: number,
    yaw: number,
    roll: number
): void {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);

    // Forward vector (-Z axis rotated by yaw * pitch * roll)
    const forwardX = -(cy * sp * cr + sy * sr);
    const forwardY = -(sp * cr * sy - cy * sr);
    const forwardZ = -(cp * cy);

    // Up vector (+Y axis rotated by yaw * pitch * roll)
    const upX = cy * sr - sy * sp * cr;
    const upY = cp * cr;
    const upZ = sy * sr + cy * sp * cr;

    listener.forwardX.value = forwardX;
    listener.forwardY.value = forwardY;
    listener.forwardZ.value = forwardZ;

    listener.upX.value = upX;
    listener.upY.value = upY;
    listener.upZ.value = upZ;
}

/**
 * Set Panner nodes orientation from Euler angles.
 *
 * Assumes:
 * - Euler order: Yaw (Y), Pitch (X), Roll (Z)
 * - Right-handed coordinate system
 * - Default forward direction is -Z
 * - Up direction is +Y
 *
 * @param panner The Web Audio API PannerNode
 * @param pitch Rotation around X axis (radians)
 * @param yaw Rotation around Y axis (radians)
 * @param roll Rotation around Z axis (radians)
 */
export function setPannerOrientationFromEuler(
    panner: PannerNode,
    pitch: number,
    yaw: number,
    roll: number
): void {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);

    // Forward vector (-Z axis rotated by yaw * pitch * roll)
    const forwardX = -(cy * sp * cr + sy * sr);
    const forwardY = -(sp * cr * sy - cy * sr);
    const forwardZ = -(cp * cy);

    panner.orientationX.value = forwardX;
    panner.orientationY.value = forwardY;
    panner.orientationZ.value = forwardZ;
}

const app = document.getElementById("app")!;
const landing = document.getElementById("landingScreen")!;
const enterButton = document.getElementById("enterAppBtn")!;
const sessionInput = document.getElementById("sessionId") as HTMLInputElement;
const joinButton = document.getElementById("enterAppBtn") as HTMLButtonElement;

const connectedIcon = document.getElementById("con-icon") as HTMLSpanElement;
const connectedText = document.getElementById("con-text") as HTMLSpanElement;

const settingsButton = document.querySelector<HTMLButtonElement>(".settings-btn");
const settingsDrawer = document.querySelector<HTMLDivElement>("#settingsDrawer");
const closeDrawerButton = document.querySelector<HTMLButtonElement>("#closeDrawerBtn");

const echoCancelButton = document.querySelector<HTMLButtonElement>("#echo-cancel");
const noiseSuppressButton = document.querySelector<HTMLButtonElement>("#noise-suppress");
const autoGainButton = document.querySelector<HTMLButtonElement>("#auto-gain");

const micMeterFill = document.querySelector<HTMLDivElement>("#micMeterFill");
const muteButton = document.querySelector<HTMLButtonElement>("#mute-btn");
const deafenButton = document.querySelector<HTMLButtonElement>("#deafen-btn");

const playerList = document.querySelector<HTMLDivElement>("#player-list");

const overlay = document.getElementById("errorOverlay");
const message = document.getElementById("errorMessage");

const closeButton = document.getElementById("errorCloseBtn");
const okButton = document.getElementById("errorOkBtn");

const toggles = document.querySelectorAll<HTMLButtonElement>(".toggle");

if (sessionParam) {
    sessionInput.value = sessionParam;
}

function updateJoinButton() {
    joinButton.disabled =
        sessionInput.value.trim().length === 0;
}

sessionInput.addEventListener("input", updateJoinButton);

updateJoinButton();

enterButton.addEventListener("click", async () => {

    const sessionId = sessionInput.value.trim();

    if (!sessionId) {
        console.log("How did we get here?");
        return;
    }

    try {

        micMeterLoop();
        const method = async () => {
            await micInput.init();
            if(echoCancelButton && noiseSuppressButton && autoGainButton) {
                try{
                    await micInput.requestMic(echoCancelButton?.classList.contains("on"), noiseSuppressButton?.classList.contains("on"), autoGainButton?.classList.contains("on"));
                    await populateDevices();
                    if(awaitMic && micInput.processedTrack){ // Check for track
                        awaitMic = false;
                        setMicSource(micInput.processedTrack); // Pass the processed track
                    }
                }
                catch(e) {
                    console.error("Failed to request mic", e);
                }
            }
        };
        method().then();

        if(audioCtx.state === "suspended"){
            audioCtx.resume().catch((e) => {
                console.error("Error with audio playback", e);
                showError("Audio playback failed to start");
            });
        }
        start(relay, sessionId);

    } catch (_err) {

    }
    landing.classList.add("hidden");

    app.classList.remove("hidden");
});

toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
        toggle.classList.toggle("on");
    });
});

if (settingsButton && settingsDrawer && closeDrawerButton) {
    settingsButton.addEventListener("click", () => {
        settingsDrawer.classList.add("open");
    });

    closeDrawerButton.addEventListener("click", () => {
        settingsDrawer.classList.remove("open");
    });
}

echoCancelButton?.addEventListener("click", async () => {
    if(echoCancelButton && noiseSuppressButton && autoGainButton) {
        try{
            await micInput.requestMic(echoCancelButton?.classList.contains("on"), noiseSuppressButton?.classList.contains("on"), autoGainButton?.classList.contains("on"))
        }
        catch(e) {
            console.error("Failed to request mic", e);
        }
    }
});

// --- DEVICE ENUMERATION ---
async function populateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputSelect = document.getElementById("inputDeviceSelect") as HTMLSelectElement;
        const outputSelect = document.getElementById("outputDeviceSelect") as HTMLSelectElement;

        // --- MOBILE FIX: Check for setSinkId support ---
        const supportsSetSinkId = 'setSinkId' in HTMLAudioElement.prototype;
        if (!supportsSetSinkId && outputSelect) {
            // Hide the entire output setting group if unsupported
            const outputGroup = outputSelect.closest('.setting-group');
            if (outputGroup) {
                (outputGroup as HTMLElement).style.display = 'none';
            }
        }

        if (!inputSelect) return;

        const currentInput = inputSelect.value;
        const currentOutput = outputSelect?.value;

        inputSelect.innerHTML = "";
        if (outputSelect) outputSelect.innerHTML = "";

        devices.forEach(device => {
            const option = document.createElement("option");
            option.value = device.deviceId;

            if (device.kind === "audioinput") {
                option.text = device.label || `Microphone ${inputSelect.length + 1}`;
                inputSelect.appendChild(option);
            } else if (device.kind === "audiooutput" && supportsSetSinkId) {
                option.text = device.label || `Speaker ${outputSelect.length + 1}`;
                outputSelect.appendChild(option);
            }
        });

        if (currentInput) inputSelect.value = currentInput;
        if (currentOutput && supportsSetSinkId) outputSelect.value = currentOutput;

    } catch (err) {
        console.error("Failed to enumerate devices", err);
    }
}

// --- UNIFIED MIC SETTINGS UPDATER ---
async function updateMicSettings() {
    const echo = echoCancelButton?.classList.contains("on") ?? true;
    const noise = noiseSuppressButton?.classList.contains("on") ?? true;
    const agc = autoGainButton?.classList.contains("on") ?? true;

    const inputSelect = document.getElementById("inputDeviceSelect") as HTMLSelectElement;
    const deviceId = inputSelect?.value;

    try {
        await micInput.requestMic(echo, noise, agc, deviceId);

        // Pass the processed track instead of the raw stream
        if (!awaitMic && micInput.processedTrack) {
            setMicSource(micInput.processedTrack);
        }
    } catch (e) {
        console.error("Failed to update mic settings", e);
    }
}

document.getElementById("inputDeviceSelect")?.addEventListener("change", updateMicSettings);
const inputGainRange = document.getElementById("inputGainRange") as HTMLInputElement;
inputGainRange?.addEventListener("input", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    micInput.gain = val / 100;

    const label = inputGainRange.parentElement?.nextElementSibling;
    if (label) label.textContent = `${val}%`;
});
document.getElementById("outputDeviceSelect")?.addEventListener("change", async (e) => {
    const deviceId = (e.target as HTMLSelectElement).value;
    try {
        // Update the Web Audio API Context sink (Modern browsers)
        if (typeof (audioCtx as any).setSinkId === "function") {
            await (audioCtx as any).setSinkId(deviceId);
        }

        // Update all active dummy audio elements
        for (const [_key, wrapper] of audioSources) {
            await wrapper.setOutputDevice(deviceId);
        }
    } catch (err) {
        console.error("Failed to set output device:", err);
    }
});
const volumeGainRange = document.getElementById("volumeGainRange") as HTMLInputElement;
volumeGainRange?.addEventListener("input", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    masterGainNode.gain.value = val / 100;

    const label = volumeGainRange.parentElement?.nextElementSibling;
    if (label) label.textContent = `${val}%`;
});
echoCancelButton?.addEventListener("click", updateMicSettings);
noiseSuppressButton?.addEventListener("click", updateMicSettings);
autoGainButton?.addEventListener("click", updateMicSettings);

function micMeterLoop() {
    let level = micInput.readMicLevel();

    if(micMeterFill) {micMeterFill.style.clipPath = `inset(0 ${100 - level*100}% 0 0)`;}
    requestAnimationFrame(micMeterLoop);
}

muteButton?.addEventListener("click", muteButtonPressed);
function muteButtonPressed() {
    muteButton?.classList.toggle("active");

    const text = muteButton?.querySelector("span");

    if (text) {
        if(muteButton?.classList.contains("active")){
            micInput.muted = true;
            text.textContent = "Muted";
        }else{
            micInput.muted = false;
            text.textContent = "Mute";
        }
    }

    if(deafenButton?.classList.contains("active")){
        deafenButtonPressed();
    }
}


deafenButton?.addEventListener("click", deafenButtonPressed);
function deafenButtonPressed(){
    {
        if(!deafenButton?.classList.contains("active") && !muteButton?.classList.contains("active")){
            muteButtonPressed();
        }
        deafenButton?.classList.toggle("active");

        const text = deafenButton?.querySelector("span");

        if (text) {
            text.textContent = deafenButton?.classList.contains("active")
                ? "Deafened"
                : "Deafen";
        }
    }
}

closeButton?.addEventListener("click", hideError);
okButton?.addEventListener("click", hideError);
overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) {
        hideError();
    }
})

function hideError() {
    overlay?.classList.add("hidden");
}

export function showError(text: string) {

    if (message) {
        message.textContent = text;
    }

    overlay?.classList.remove("hidden");
}

function setConnectionStatus(status: number) {
    connectedIcon.classList.remove("inactive")
    connectedIcon.classList.remove("connected")
    connectedIcon.classList.remove("connecting")
    connectedIcon.classList.remove("disconnected")
    if(status === 0){
        connectedIcon.classList.add("connected");
        connectedText.textContent = "Connected";
    }
    else if(status === 1){
        connectedIcon.classList.add("connecting");
        connectedText.textContent = "Connecting";
    }
    else if(status === 2){
        connectedIcon.classList.add("disconnected");
        connectedText.textContent = "Disconnected";
    }else{
        connectedIcon.classList.add("inactive");
        connectedText.textContent = "Inactive";
    }
}

function addPlayerProf(audioProfile: AudioProfile) {
    playerList?.appendChild(audioProfile.html);
}