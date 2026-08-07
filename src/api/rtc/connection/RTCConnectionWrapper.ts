import {WebspeakEvent} from "../../event/Event.ts";

export class RTCConnectionWrapper {
    private readonly _rtcConnection: RTCPeerConnection;
    private readonly _readyEvent: WebspeakEvent.Invokable<void> = WebspeakEvent.create();
    private readonly _reliablePacketReceivedEvent: WebspeakEvent.Invokable<string> = WebspeakEvent.create();
    private readonly _unreliablePacketReceivedEvent: WebspeakEvent.Invokable<Uint8Array> = WebspeakEvent.create();

    private _reliableChannel?: RTCDataChannel;
    private _unreliableChannel?: RTCDataChannel;
    private _micTransceiver?: RTCRtpTransceiver;

    private sendReady: boolean = true;

    constructor(config: RTCConfiguration) {
        this._rtcConnection = new RTCPeerConnection(config);

        //ideally this should be pre-negotiated, but I'm scared of setting the session description
        this._rtcConnection.ondatachannel = (event: RTCDataChannelEvent) => {
            const receiveChannel: RTCDataChannel = event.channel;
            receiveChannel.binaryType = "arraybuffer";
            switch (receiveChannel.label){
                case "reliable":
                    this._reliableChannel = receiveChannel;
                    this._reliableChannel.onmessage = (event: MessageEvent) => {
                        if(typeof event.data === 'string') {
                            this._reliablePacketReceivedEvent.invoke(event.data);
                        }
                    }
                    this._reliableChannel.onopen = () => {
                        this.tryReady();
                    };
                    this.tryReady();
                    break;
                case "unreliable":
                    this._unreliableChannel = receiveChannel;
                    this._unreliableChannel.onmessage = (event: MessageEvent) => {
                        if(event.data instanceof ArrayBuffer) {
                            this._unreliablePacketReceivedEvent.invoke(new Uint8Array(event.data));
                        }
                    }
                    this._unreliableChannel.onopen = () => {
                        this.tryReady();
                    };
                    this.tryReady();
                    break;
            }
        }
    }

    public get rtcConnection(): RTCPeerConnection {
        return this._rtcConnection;
    }

    public get onReady(): WebspeakEvent<void> {
        return this._readyEvent;
    }

    public get onReliablePacketReceived(): WebspeakEvent<string>{
        return this._reliablePacketReceivedEvent;
    }

    public get onUnreliablePacketReceived(): WebspeakEvent<Uint8Array>{
        return this._unreliablePacketReceivedEvent;
    }

    public setRemoteDescription(description: RTCSessionDescriptionInit) {
        return this._rtcConnection.setRemoteDescription(description).then(
            ()=>{
                this._micTransceiver = this._rtcConnection.getTransceivers().find(t => t.receiver.track.kind === "audio");

                this._micTransceiver!.direction = "sendonly";
                this.tryReady();
            }, ()=>{

            }
        );
    }

    public setMicTrack(track: MediaStreamTrack | null): Promise<void>{
        if (!this._micTransceiver) {
            return Promise.reject(new Error("Mic transceiver is not yet ready"));
        }
        return this._micTransceiver.sender.replaceTrack(track);
    }

    public sendReliablePacket(message: string): void{
        this._reliableChannel?.send(message);
    }

    public sendUnreliablePacket(message: ArrayBuffer): void{
        this._unreliableChannel?.send(message);
    }

    public isOpen(): boolean{
        if(!this._micTransceiver || !this._reliableChannel || !this._unreliableChannel || this._reliableChannel.readyState !== "open" || this._unreliableChannel.readyState !== "open"){
            return false;
        }

        return true;
    }

    private tryReady(): void{
        if(this.sendReady){
            if(this.isOpen()){
                this.sendReady = false;
                this._readyEvent.invoke();
            }
        }
    }
}