export namespace RTCSignalingMessages {
    export interface RTCSignalingMessage {
        getType(): string;
    }

    export class iceCandidate implements RTCSignalingMessage {
        public static readonly TYPE: string = "RTCiceCandidate";
        constructor(public readonly sdpMid: string | null, public readonly sdpMLineIndex: number | null, public readonly sdp?: string) {}

        getType(): string {
            return iceCandidate.TYPE;
        }
    }

    export class sessionDescription implements  RTCSignalingMessage{
        public static readonly TYPE: string = "RTCsessionDescription";
        public static parseRTCSdpType(value: string): number {
            switch (value) {
                case "offer":
                    return 0;
                case "pr_answer":
                    return 1;
                case "answer":
                    return 2;
            }
            return 3;
        }

        constructor(public readonly RTCSdpType?: number, public readonly sdp?: string) {
        }

        getRTCSdpType(): string{
            if (this.RTCSdpType == 0) {
                return "offer";
            } else if (this.RTCSdpType == 1) {
                return "pr_answer";
            } else if (this.RTCSdpType == 2) {
                return "answer";
            } else {
                return "rollback";
            }
        }

        getType(): string {
            return iceCandidate.TYPE;
        }
    }

    export function write<T extends RTCSignalingMessage>(message: T): string {
        const obj = {
            ...message,
            type: message.getType(),
        };

        return JSON.stringify(obj);
    }
}