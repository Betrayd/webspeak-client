import {WebSpeakClient} from "./api/WebspeakClient.ts";
import type {WebspeakConfig} from "./api/WebspeakConfig.ts";
import {AudioSource} from "./api/AudioSource.ts";

class AudioProfile{
    public audioId: number | null | undefined;
    private readonly _html: HTMLDivElement;

    constructor(public readonly uid: string, audioId: number | null | undefined, public readonly name: string){
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
        });

        const volumeInput = card.getElementsByTagName("input")[0];

        volumeInput.addEventListener("change", () => {
            console.log(`player slider updated ${name}: ${volumeInput.value}`);
        });

        this._html = card;
    }

    public get html(): HTMLDivElement{
        return this._html;
    }
}

class AudioSourceWrapper{
    private readonly _panner: PannerNode;

    private mediaSource?: MediaStreamAudioSourceNode;
    constructor(ctx: AudioContext, public readonly source: AudioSource) {
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
                    return;
                }

                const stream = new MediaStream([track]);
                this.mediaSource = ctx.createMediaStreamSource(stream);
                this.mediaSource.connect(this._panner);
            }
            else{
                this.mediaSource?.disconnect();
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

        panner.connect(ctx.destination);
        this._panner = panner;
    }

    public get panner(): PannerNode {
        return this._panner;
    }

    public disconnect():void{
        this.mediaSource?.disconnect();
        this._panner.disconnect();
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
        this.ctx = new window.AudioContext();
    }

    public async requestMic(cancelEcho: boolean, noiseSuppress: boolean, autoGain: boolean):Promise<MediaStream> {
        if(this.ctx === undefined){
            throw new Error("ctx not set");
        }
        const constraints = {
            audio: {
                echoCancellation: cancelEcho,
                noiseSuppression: noiseSuppress,
                autoGainControl: autoGain,
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
        this._micSource.connect(this._micGain).connect(this._analyser);

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
    }
}

const params: URLSearchParams = new URLSearchParams(window.location.search);
const sessionParam: string | null = params.get("id");
const relayParam: string | null = params.get("relay");
const relay: URL = relayParam ? new URL(relayParam+"/join") : new URL("wss://webspeak.betrayd.net/join");

const audioCtx = new AudioContext();

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
        if(micInput.micStream !== undefined){
            awaitMic = false;
            setMicSource(micInput.micStream);
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
        audioProfiles.clear();
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
        const wrapper = new AudioSourceWrapper(audioCtx, source);
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
        const prof: AudioProfile = new AudioProfile(event.uid, event.id, event.name);
        audioProfiles.set(event.uid, prof);

        addPlayerProf(prof);
    });

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

function setMicSource(stream: MediaStream){
    client?.setMic(stream.getAudioTracks()[0]).then(
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
                    const stream = await micInput.requestMic(echoCancelButton?.classList.contains("on"), noiseSuppressButton?.classList.contains("on"), autoGainButton?.classList.contains("on"));
                    if(awaitMic){
                        awaitMic = false;
                        setMicSource(stream);
                    }
                }
                catch(e) {
                    console.error("Failed to request mic", e);
                }
            }
        };
        method().then();


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