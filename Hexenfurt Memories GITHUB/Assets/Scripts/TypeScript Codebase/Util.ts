// Shared utility helpers: delays, simple animation stepping, and scene-object
// helpers. Exposed as global.utils.

interface AnimationData {
    id: string;
    startTime: number;
    updateEvent: SceneEvent;
    cleanup?: () => void;
}

interface SceneObjectWithAnimations extends SceneObject {
    animations?: AnimationData[];
}

@component
export class Util extends BaseScriptComponent {
    private delayedCallbacks: { [id: string]: SceneEvent } = {};
    private activeAnimations: AnimationData[] = [];

    onAwake(): void {
        const api: HexenfurtUtils = {
            stateChangeArrayWithException: (arr, exceptionIndex, exceptionState) => this.stateChangeArrayWithException(arr, exceptionIndex, exceptionState),
            stateChangeArray: (arr, state) => this.stateChangeArray(arr, state),
            removeAllChildren: (so) => this.removeAllChildren(so),
            stateChangeArrayClassProperty: (arr, propName, state) => this.stateChangeArrayClassProperty(arr, propName, state),
            rng: (min, max) => this.rng(min, max),
            rngFloat: (min, max, decimals) => this.rngFloat(min, max, decimals),
            lerp: (start, end, amt) => this.lerp(start, end, amt),
            arrayContains: <T>(arr: T[], item: T) => this.arrayContains(arr, item),
            delay: (a: any, b?: any, c?: any) => this.delay(a, b, c),
            invalidateDelay: (id) => this.invalidateDelay(id),
            animatePosition: (so, isLocal, newPos, duration, callback) => this.animatePosition(so, isLocal, newPos, duration, callback),
            animateRotation: (so, isLocal, newRot, duration, callback) => this.animateRotation(so, isLocal, newRot, duration, callback),
            animateScale: (so, isLocal, newScale, duration, callback) => this.animateScale(so, isLocal, newScale, duration, callback),
        };
        global.utils = api;
    }

    private stateChangeArrayWithException(arr: { enabled: boolean }[], exceptionIndex: number, exceptionState: boolean): void {
        for (let i = 0; i < arr.length; i++) {
            arr[i].enabled = !exceptionState;
        }
        arr[exceptionIndex].enabled = exceptionState;
    }

    private stateChangeArray(arr: { enabled: boolean }[], state: boolean): void {
        for (let i = 0; i < arr.length; i++) {
            arr[i].enabled = state;
        }
    }

    private removeAllChildren(sceneObject: SceneObject | null | undefined): void {
        if (!sceneObject) return;
        for (let i = sceneObject.getChildrenCount() - 1; i >= 0; i--) {
            const child = sceneObject.getChild(i);
            if (child) {
                child.destroy();
            }
        }
    }

    private stateChangeArrayClassProperty(arr: any[], propName: string, state: boolean): void {
        for (let i = 0; i < arr.length; i++) {
            arr[i][propName].enabled = state;
        }
    }

    private rng(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private rngFloat(min: number, max: number, decimals: number): number {
        const str = (Math.random() * (max - min) + min).toFixed(decimals);
        return parseFloat(str);
    }

    private lerp(start: number, end: number, amt: number): number {
        return (1 - amt) * start + amt * end;
    }

    private arrayContains<T>(arr: T[], item: T): boolean {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === item) return true;
        }
        return false;
    }

    // Overloaded delay: (delaySec, cb) or (id, delaySec, cb).
    private delay(idOrDelay: string | number, delayOrCallback: number | (() => void), callback?: () => void): void {
        let id: string | null = null;
        let delay: number;
        let cb: () => void;

        if (typeof idOrDelay === "string" && typeof delayOrCallback === "number" && typeof callback === "function") {
            id = idOrDelay;
            delay = delayOrCallback;
            cb = callback;
        } else if (typeof idOrDelay === "number" && typeof delayOrCallback === "function") {
            delay = idOrDelay;
            cb = delayOrCallback;
        } else {
            return;
        }

        if (id && this.delayedCallbacks[id]) {
            this.invalidateDelay(id);
        }

        const delayedEvent = this.createEvent("DelayedCallbackEvent");
        delayedEvent.bind(() => {
            if (id) {
                delete this.delayedCallbacks[id];
            }
            cb();
        });
        delayedEvent.reset(delay);

        if (id) {
            this.delayedCallbacks[id] = delayedEvent;
        }
    }

    private invalidateDelay(id: string): void {
        const evt = this.delayedCallbacks[id];
        if (evt) {
            (evt as any).cancel?.();
            delete this.delayedCallbacks[id];
        }
    }

    private registerAnimation(sceneObject: SceneObject, animationData: AnimationData): void {
        if (!sceneObject) return;

        const owner = sceneObject as SceneObjectWithAnimations;
        if (!owner.animations) owner.animations = [];

        const prefix = animationData.id.split("_")[1];

        for (let i = owner.animations.length - 1; i >= 0; i--) {
            const existing = owner.animations[i];
            if (existing.id.indexOf(prefix) !== -1) {
                if (existing.updateEvent) {
                    existing.updateEvent.enabled = false;
                    this.removeEvent(existing.updateEvent);
                }
                owner.animations.splice(i, 1);
            }
        }

        owner.animations.push(animationData);
        this.activeAnimations.push(animationData);

        animationData.cleanup = () => {
            if (owner.animations) {
                owner.animations = owner.animations.filter((a) => a !== animationData);
            }
            this.activeAnimations = this.activeAnimations.filter((a) => a !== animationData);
        };
    }

    private animatePosition(sceneObject: SceneObject, isLocal: boolean, newPosition: vec3, duration: number, callback?: () => void): void {
        if (!sceneObject) return;
        const transform = sceneObject.getTransform();

        const animationData: AnimationData = {
            id: sceneObject.name + "_position",
            startTime: getTime(),
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(sceneObject, animationData);

        const startPosition = isLocal ? transform.getLocalPosition() : transform.getWorldPosition();

        animationData.updateEvent.bind(() => {
            const elapsed = getTime() - animationData.startTime;
            const t = Math.min(elapsed / duration, 1);
            const smoothT = t * t * (3 - 2 * t);
            const currentPosition = vec3.lerp(startPosition, newPosition, smoothT);

            if (isLocal) transform.setLocalPosition(currentPosition);
            else transform.setWorldPosition(currentPosition);

            if (t >= 1) {
                if (isLocal) transform.setLocalPosition(newPosition);
                else transform.setWorldPosition(newPosition);

                animationData.cleanup?.();
                animationData.updateEvent.enabled = false;
                this.removeEvent(animationData.updateEvent);
                if (callback) callback();
            }
        });
    }

    private animateRotation(sceneObject: SceneObject, isLocal: boolean, newRotation: quat | vec3, duration: number, callback?: () => void): void {
        if (!sceneObject) return;
        const transform = sceneObject.getTransform();

        const animationData: AnimationData = {
            id: sceneObject.name + "_rotation",
            startTime: getTime(),
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(sceneObject, animationData);

        const DEG_TO_RAD = 0.0174533;
        const targetQuat: quat = newRotation instanceof quat
            ? newRotation
            : quat.fromEulerAngles(
                (newRotation as vec3).x * DEG_TO_RAD,
                (newRotation as vec3).y * DEG_TO_RAD,
                (newRotation as vec3).z * DEG_TO_RAD
            );

        const startQuat: quat = isLocal ? transform.getLocalRotation() : transform.getWorldRotation();

        animationData.updateEvent.bind(() => {
            const elapsed = getTime() - animationData.startTime;
            const t = Math.min(elapsed / duration, 1);
            const smoothT = t * t * (3 - 2 * t);

            const currentQuat = quat.slerp(startQuat, targetQuat, smoothT);
            currentQuat.normalize();

            if (isLocal) transform.setLocalRotation(currentQuat);
            else transform.setWorldRotation(currentQuat);

            if (t >= 1) {
                if (isLocal) transform.setLocalRotation(targetQuat);
                else transform.setWorldRotation(targetQuat);

                animationData.cleanup?.();
                animationData.updateEvent.enabled = false;
                this.removeEvent(animationData.updateEvent);
                if (callback) callback();
            }
        });
    }

    private animateScale(sceneObject: SceneObject, isLocal: boolean, newScale: vec3, duration: number, callback?: () => void): void {
        if (!sceneObject) return;
        const transform = sceneObject.getTransform();

        const animationData: AnimationData = {
            id: sceneObject.name + "_scale",
            startTime: getTime(),
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(sceneObject, animationData);

        const startScale = isLocal ? transform.getLocalScale() : transform.getWorldScale();

        animationData.updateEvent.bind(() => {
            const elapsed = getTime() - animationData.startTime;
            const t = Math.min(elapsed / duration, 1);
            const smoothT = t * t * (3 - 2 * t);

            const currentScale = vec3.lerp(startScale, newScale, smoothT);
            transform.setLocalScale(currentScale);

            if (t >= 1) {
                if (isLocal) transform.setLocalScale(newScale);
                else transform.setWorldScale(newScale);

                animationData.cleanup?.();
                animationData.updateEvent.enabled = false;
                this.removeEvent(animationData.updateEvent);
                if (callback) callback();
            }
        });
    }
}
