import {ReliableMessages} from "../connection/ReliableMessages.ts";

export namespace RTCSignalingMessages {
    export interface RTCSignalingMessage extends ReliableMessages.ReliableMessage{

    }

    export class iceCandidate implements RTCSignalingMessage {
        public static readonly TYPE: string = "RTCiceCandidate";
        constructor(public readonly sdpMid: string | null, public readonly sdpMLineIndex: number | null, public readonly sdp: string) {}

        get type(): string {
            return iceCandidate.TYPE;
        }
    }

    export class sessionDescription implements  RTCSignalingMessage{
        public static readonly TYPE: string = "RTCsessionDescription";
        public static parseRTCSdpType(value: RTCSdpType): number {
            switch (value) {
                case "offer":
                    return 0;
                case "pranswer":
                    return 1;
                case "answer":
                    return 2;
            }
            return 3;
        }
        public static getRTCSdpType(obj: sessionDescription): RTCSdpType{
            if (obj.RTCSdpType == 0) {
                return "offer";
            } else if (obj.RTCSdpType == 1) {
                return "pranswer";
            } else if (obj.RTCSdpType == 2) {
                return "answer";
            } else {
                return "rollback";
            }
        }

        constructor(public readonly RTCSdpType: number, public readonly sdp?: string) {}

        get type(): string {
            return sessionDescription.TYPE;
        }
    }

    export function write<T extends RTCSignalingMessage>(message: T): string {
        return ReliableMessages.write(message);
    }
}