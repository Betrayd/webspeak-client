export namespace ReliableMessages {
    export function isReliableMessage(obj: unknown): obj is ReliableMessage{
        if (obj !== null && typeof obj === "object"){
            if("type" in obj){
                if(typeof (obj as { type: unknown}).type === "string"){
                    return true;
                }
            }
        }
        return false;
    }

    export interface ReliableMessage {
        get type(): string;
    }

    export class addAudioSource implements ReliableMessage{
        public static readonly TYPE: string = "addSrc";

        constructor(public readonly id: string, public readonly config: string | null | undefined, public readonly pos: Array<number> | null | undefined){
            if(pos && pos.length != 3){
                throw new Error("addAudioSource: pos must be 3");
            }
        }

        get type(): string {
            return addAudioSource.TYPE;
        }
    }

    export class removeAudioSource implements ReliableMessage{
        public static readonly TYPE: string = "remvSrc";

        constructor(public readonly id: string) {}

        get type(): string {
            return removeAudioSource.TYPE;
        }
    }

    export class addAudioProfile implements ReliableMessage{
        public static readonly TYPE: string = "addProf";

        constructor(public readonly uid: string, public readonly name: string, public readonly id: string | null | undefined) {}

        get type(): string {
            return addAudioProfile.TYPE;
        }
    }

    export class updateProfileSource implements ReliableMessage{
        public static readonly TYPE: string = "updateProfSrc";

        constructor(public readonly uid: string, public id: string | null | undefined) {
        }

        get type(): string {
            return updateProfileSource.TYPE;
        }
    }

    export class removeAudioProfile implements ReliableMessage{
        public static readonly TYPE: string = "remvProf";

        constructor(public readonly uid: string) {
        }

        get type(): string {
            return removeAudioProfile.TYPE;
        }
    }

    export function write<T extends ReliableMessage>(message: T): string {
        const obj = {
            ...message,
            type: message.type,
        };

        return JSON.stringify(obj);
    }
}