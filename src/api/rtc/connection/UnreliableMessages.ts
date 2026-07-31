import {Vec3d} from "../../Vec3d.ts";

export namespace UnreliableMessages {
    export interface UnreliableMessage{
        getType(): number;
    }

    export function parseBytes(bytes: Uint8Array): UnreliableMessage | undefined{
        if(bytes.length > 0){
            const type: number = bytes[0];
            switch(type){
                case audioSourcePosition.TYPE: {
                    if(bytes.length === 27){
                        const audioSourceId: string = btoa(String.fromCharCode(bytes[1], bytes[2]));
                        const pos: Vec3d = Vec3d.fromUint8Array(bytes, 3);

                        return new UnreliableMessages.audioSourcePosition(audioSourceId, pos);
                    }
                    break;
                }
            }
        }
        return undefined;
    }

    export class audioSourcePosition implements UnreliableMessage {
        public static readonly TYPE: number = 1;
        constructor(public readonly id: string, public readonly pos: Vec3d) {}

        getType(): number {
            return audioSourcePosition.TYPE;
        }
    }
}