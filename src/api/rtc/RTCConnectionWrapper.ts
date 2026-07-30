import {WebspeakEvent} from "../event/Event.ts";

export class RTCConnectionWrapper {
    private readonly _rtcConnection: RTCPeerConnection;
    private readonly _reliablePacketReceivedEvent: WebspeakEvent.Invokable<String> = WebspeakEvent.create();
    private readonly _unreliablePacketReceivedEvent: WebspeakEvent.Invokable<Uint8Array> = WebspeakEvent.create();

    private _reliableChannel?: RTCDataChannel;
    private _unreliableChannel?: RTCDataChannel;
    private _micTranseiver?: RTCRtpTransceiver;

    constructor(config: RTCConfiguration) {
        this._rtcConnection = new RTCPeerConnection(config);

        this._micTranseiver = this._rtcConnection.addTransceiver('audio', { direction: 'sendonly' });

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
                    break;
                case "unreliable":
                    this._unreliableChannel = receiveChannel;
                    this._unreliableChannel.onmessage = (event: MessageEvent) => {
                        if(event.data instanceof ArrayBuffer) {
                            this._unreliablePacketReceivedEvent.invoke(new Uint8Array(event.data));
                        }
                    }
                    break;
            }
        }
    }

    public get rtcConnection(): RTCPeerConnection {
        return this._rtcConnection;
    }

    public get onReliablePacketReceived(): WebspeakEvent<String>{
        return this._reliablePacketReceivedEvent;
    }

    public get onUnreliablePacketReceived(): WebspeakEvent<Uint8Array>{
        return this._unreliablePacketReceivedEvent;
    }

    public setMicTrack(track: MediaStreamTrack): Promise<void>{
        return new Promise<void>((_resolve, reject) => {
            if(!this._micTranseiver){
                reject(new Error("Mic transceiver is not yet ready"));
            }
            return this._micTranseiver?.sender.replaceTrack(track);
        });
    }

    public sendReliablePacket(message: string): void{
        this._reliableChannel?.send(message);
    }

    public sendUnreliablePacket(message: ArrayBuffer): void{
        this._unreliableChannel?.send(message);
    }

    public isOpen(): boolean{
        if(!this._reliableChannel || !this._unreliableChannel || this._reliableChannel.readyState !== "open" || this._unreliableChannel.readyState !== "open"){
            return false;
        }

        return true;
    }
}