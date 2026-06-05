// Surface detection and anchor placement through the World Query module.
// The setup-view root for pinch-in-air detection is owned by ViewController
// (global.hexenfurtSetupViewRoot), not an input on this script.

const WorldQueryModule: WorldQueryModule = require("LensStudio:WorldQueryModule");
const sikModule = require("SpectaclesInteractionKit.lspkg/SIK");
const SIK = sikModule.SIK || sikModule.default || sikModule;
const InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;

type RecordingMode = null | "eye-height" | "ground-height" | "exit-door" | "poi-anchors";

interface RecordingData {
    objective: number | null;
    recorded: number | null;
    callback: (() => void) | null;
    recordingMsg: string;
    completed?: number;
}

interface IdentifiedSurface {
    surfaceType: "ground" | "ceiling" | "wall";
    position: vec3;
    rotation: quat;
    normal: vec3;
}

interface GameFlowCallback {
    updateAnchorRequirementsHint(): void;
}

interface PlacementEval {
    needed: boolean;
    farFromAnchors: boolean;
    farFromDoor: boolean;
    closeToFloor: boolean;
    valid: boolean;
}

@component
export class WorldQueryManager extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Core</span>")
    @input
    public camera!: Camera;

    @input
    public maxHitDistance: number = 270.0;

    @input
    @hint("Where the visual scan reticle is positioned.")
    public hitOriginObject!: SceneObject;

    @input
    public filter: boolean = false;

    @input
    public worldGridMaterial!: Material;

    @input
    public tweens!: SceneObject;

    @input
    public gameFlow!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Surface Classification</span>")
    @input
    public angleThreshold: number = 45.0;

    @input
    public wallYOffset: number = -20;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Placement Visuals</span>")
    @input
    @hint("Phase-specific placement guides (ground / door / anchors). Shown one at a time during recording.")
    public placementGuides: SceneObject[] = [];

    @input
    public groundPlane!: SceneObject;

    @input
    public anchorPrefab!: ObjectPrefab;

    @input
    public anchorVisualsRoot!: SceneObject;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Anchor Targets</span>")
    @input
    public groundAnchorsTarget: number = 2;

    @input
    public wallAnchorsTarget: number = 2;

    @input
    public ceilingAnchorsTarget: number = 1;

    @input
    public maxDistanceToOtherAnchors: number = 100;

    @input
    public groundAnchorLevelPrecision: number = 10;

    @input
    @hint("Max time (seconds) between pinch start and release for it to count as a tap. Held pinches do not snap.")
    public maxHold: number = 0.3;
    @ui.group_end

    public eyeHeight: number | null = null;
    public groundHeight: number | null = null;
    public exitDoor: HexenfurtExitDoor | null = null;
    public lastFaced: string = "null";
    public measureButton: boolean = false;
    public currentlyRecording: RecordingMode = null;

    public recordingData: RecordingData = {
        objective: null,
        recorded: null,
        callback: null,
        recordingMsg: "Hello World!",
    };

    private hitTestSession: HitTestSession | null = null;
    private scanEvent!: SceneEvent;
    private eyeHeightEvent!: SceneEvent;
    private eyeCallback: (() => void) | null = null;
    private pinchStartTime: number = 0;
    private currentHint: string = "";

    // Pooled reticle-scale animation: one reusable UpdateEvent instead of a
    // fresh event allocated on every scaleEvent() call (which fires many times
    // per frame during anchor placement).
    private scaleAnimEvent!: SceneEvent;
    private scaleAnimTarget: number = 0;
    private scaleAnimSpeed: number = 0.1;
    private scaleAnimControl: number = 0;

    onAwake(): void {
        global.surfaceAnchors = [];
        global.groundHeight = -170.0;

        this.scanEvent = this.createEvent("UpdateEvent");
        this.scanEvent.enabled = false;
        this.scanEvent.bind(() => this.scan());

        this.eyeHeightEvent = this.createEvent("UpdateEvent");
        this.eyeHeightEvent.enabled = false;
        this.eyeHeightEvent.bind(() => this.eyeHeightRecording());

        this.scaleAnimEvent = this.createEvent("UpdateEvent");
        this.scaleAnimEvent.enabled = false;
        this.scaleAnimEvent.bind(() => this.tickScaleAnim());
    }

    public reset(): void {
        this.eyeHeight = null;
        this.groundHeight = null;
        global.groundHeight = -170.0;
        this.exitDoor = null;
        global.surfaceAnchors = [];
        this.measureButton = false;
        this.currentlyRecording = null;
        this.recordingData = {
            objective: null,
            recorded: null,
            callback: null,
            recordingMsg: "Hello World!",
        };
        this.anchorVisualsRoot.enabled = true;
        global.utils.removeAllChildren(this.anchorVisualsRoot);
        (this.gameFlow as unknown as GameFlowCallback).updateAnchorRequirementsHint();
    }

    public recordEyeHeight = (callback?: () => void): void => {
        print("recording eye height...");
        this.currentlyRecording = "eye-height";
        this.eyeHeightEvent.enabled = true;
        this.eyeCallback = callback ?? null;
    };

    public recordGroundHeight = (callback?: () => void): void => {
        print("recording ground height...");
        this.recordingData.callback = (typeof callback === "function") ? callback : null;
        this.recordingData.objective = 1;
        this.recordingData.completed = 0;
        this.recordingData.recordingMsg = "Pinch to select the lowest point on the floor.";
        this.currentlyRecording = "ground-height";
        this.switchVisualHint();

        this.hitTestSession = this.createHitTestSession();
        this.hitTestSession.start();
        this.scanEvent.enabled = true;
    };

    public recordDoorSurfaceAnchor = (callback?: () => void): void => {
        print("recording door placement...");
        this.recordingData.callback = (typeof callback === "function") ? callback : null;
        this.recordingData.objective = 1;
        this.recordingData.completed = 0;
        this.recordingData.recordingMsg = "Pinch to create the escape room's exit door.";
        this.currentlyRecording = "exit-door";
        this.switchVisualHint();

        this.hitTestSession = this.createHitTestSession();
        this.hitTestSession.start();
        this.scanEvent.enabled = true;
    };

    public recordPOISurfaceAnchors = (callback?: () => void): void => {
        print("recording poi anchors placement...");
        this.recordingData.callback = callback ?? null;
        this.recordingData.objective = this.groundAnchorsTarget + this.wallAnchorsTarget + this.ceilingAnchorsTarget;
        this.recordingData.completed = 0;
        this.recordingData.recordingMsg = "Pinch to create surface anchors.";
        this.currentlyRecording = "poi-anchors";
        this.switchVisualHint();

        this.hitTestSession = this.createHitTestSession();
        this.hitTestSession.start();
        this.scanEvent.enabled = true;
    };

    public stopRecording = (): void => {
        this.currentlyRecording = null;
        this.eyeCallback = null;
        print("Completed WQM Recording!");
        this.scanEvent.enabled = false;
        this.eyeHeightEvent.enabled = false;
        if (this.hitTestSession) {
            this.hitTestSession.stop();
        }
        this.scaleEvent(0, 0.1);
    };

    public manuallySnapCurrentScan = (callback?: () => void): void => {
        if (typeof callback === "function") {
            this.recordingData.callback = callback;
            if (this.currentlyRecording === "eye-height") {
                this.eyeCallback = callback;
            }
        }

        if (this.currentlyRecording === "eye-height") {
            const cb = this.eyeCallback || this.recordingData.callback;
            this.snapEyeHeight(cb ?? undefined);
            return;
        }

        this.measure();
    };

    public checkAnchorsNeededAlt = (): boolean => {
        let groundCount = 0, wallCount = 0, ceilingCount = 0;
        for (const anchor of global.surfaceAnchors) {
            if (anchor.surfaceType === "ground") groundCount++;
            else if (anchor.surfaceType === "wall") wallCount++;
            else if (anchor.surfaceType === "ceiling") ceilingCount++;
        }
        const missing: string[] = [];
        if (groundCount < this.groundAnchorsTarget) missing.push("Floor");
        if (wallCount < this.wallAnchorsTarget) missing.push("Wall");
        if (ceilingCount < this.ceilingAnchorsTarget) missing.push("Ceiling");
        return missing.length === 0;
    };

    public checkAnchorsNeeded = (): string => {
        if (this.currentlyRecording !== "poi-anchors") return "";

        let groundCount = 0, wallCount = 0, ceilingCount = 0;
        for (const anchor of global.surfaceAnchors) {
            if (anchor.surfaceType === "ground") groundCount++;
            else if (anchor.surfaceType === "wall") wallCount++;
            else if (anchor.surfaceType === "ceiling") ceilingCount++;
        }

        const missing: string[] = [];
        if (groundCount < this.groundAnchorsTarget) missing.push("Floor");
        if (wallCount < this.wallAnchorsTarget) missing.push("Wall");
        if (ceilingCount < this.ceilingAnchorsTarget) missing.push("Ceiling");

        if (missing.length === 0) {
            return "All anchors placed. \n You can delete an anchor by pinching the red button above it.";
        }
        let error = "";
        if (this.currentHint !== "") error = "\n" + this.currentHint;
        return "Place more anchors on: " + missing.join(", ") + error;
    };

    private getCameraPosition(): vec3 {
        return this.camera.getTransform().getWorldPosition();
    }

    private snapEyeHeight(callback?: () => void): void {
        this.eyeHeight = this.getCameraPosition().y;
        if (typeof callback === "function") callback();
    }

    private eyeHeightRecording(): void {
        if (this.pinchingAir()) {
            this.snapEyeHeight(this.eyeCallback ?? undefined);
        }
    }

    private pinchingAir(): boolean {
        const interactors: any[] = SIK.InteractionManager.getTargetingInteractors();
        const primary = interactors && interactors.length ? interactors[0] : null;
        if (!primary) return false;

        if (primary.previousTrigger === InteractorTriggerType.None &&
            primary.currentTrigger !== InteractorTriggerType.None) {
            this.pinchStartTime = getTime();
            return false;
        }

        if (primary.previousTrigger !== InteractorTriggerType.None &&
            primary.currentTrigger === InteractorTriggerType.None) {
            const inAir =
                (primary.targetHitInfo == null) ||
                (primary.targetHitInfo.hit &&
                 primary.targetHitInfo.hit.collider &&
                 primary.targetHitInfo.hit.collider.getSceneObject() &&
                 this.isSetupViewObject(primary.targetHitInfo.hit.collider.getSceneObject()));

            const held = getTime() - this.pinchStartTime;
            const maxHold = (typeof this.maxHold === "number" && this.maxHold > 0) ? this.maxHold : 0.3;
            return inAir && held <= maxHold;
        }
        return false;
    }

    private isSetupViewObject(obj: SceneObject): boolean {
        const setupRoot = global.hexenfurtSetupViewRoot;
        if (setupRoot && obj === setupRoot) return true;
        if (obj && obj.name === "Setup View") return true;
        return false;
    }

    private switchVisualHint(): void {
        switch (this.currentlyRecording) {
            case "ground-height":
                global.utils.stateChangeArrayWithException(this.placementGuides, 0, true);
                break;
            case "exit-door":
                global.utils.stateChangeArrayWithException(this.placementGuides, 1, true);
                break;
            case "poi-anchors":
                global.utils.stateChangeArrayWithException(this.placementGuides, 2, true);
                break;
        }
    }

    private identifySurfaceType(position: vec3, normal: vec3): IdentifiedSurface {
        const hitPosition = position;
        const hitNormal = normal;

        const upVector = vec3.up();
        let dotProduct = hitNormal.dot(upVector);
        dotProduct = Math.min(Math.max(dotProduct, -1.0), 1.0);
        const angle = Math.acos(dotProduct) * (180 / Math.PI);
        const lookDirection = hitNormal.cross(vec3.up());
        let toRotation = quat.lookAt(lookDirection, hitNormal);

        let surfaceType: "ground" | "ceiling" | "wall";
        if (angle <= this.angleThreshold) {
            surfaceType = "ground";
            toRotation = quat.lookAt(vec3.forward(), vec3.up());
        } else if (angle >= 180.0 - this.angleThreshold) {
            surfaceType = "ceiling";
            toRotation = quat.lookAt(vec3.forward(), vec3.down());
        } else {
            surfaceType = "wall";
            hitPosition.y = (this.eyeHeight ?? 0) - this.wallYOffset;
            if (this.currentlyRecording === "exit-door") {
                hitPosition.y = this.groundHeight ?? 0;
            }
        }
        this.lastFaced = surfaceType;

        return {
            surfaceType,
            position: hitPosition,
            rotation: toRotation,
            normal: hitNormal,
        };
    }

    private scaleEvent(newScale: number, scaleSpeed: number): void {
        this.scaleAnimTarget = newScale;
        this.scaleAnimSpeed = scaleSpeed;
        this.scaleAnimControl = 0;
        this.scaleAnimEvent.enabled = true;
    }

    private tickScaleAnim(): void {
        const speed = this.scaleAnimSpeed;
        const target = this.scaleAnimTarget;
        this.scaleAnimControl = (1 - speed) * this.scaleAnimControl + speed * 1;

        const tr = this.hitOriginObject.getTransform();
        const currentScale = tr.getWorldScale();
        tr.setWorldScale(vec3.lerp(currentScale, new vec3(target, target, target), speed));

        if (Math.abs(this.scaleAnimControl - 1) < 0.01) {
            tr.setWorldScale(new vec3(target, target, target));
            this.scaleAnimEvent.enabled = false;
        }
    }

    private createHitTestSession(): HitTestSession {
        const options = HitTestSessionOptions.create();
        options.filter = this.filter;
        return WorldQueryModule.createHitTestSessionWithOptions(options);
    }

    private performHitTest(rayStart: vec3, rayEnd: vec3): void {
        if (!this.hitTestSession) return;
        this.hitTestSession.hitTest(rayStart, rayEnd, (results) => this.onHitTestResult(results));
    }

    private scan(): void {
        const cameraTransform = this.camera.getTransform();
        const rayStart = cameraTransform.getWorldPosition();
        const rayDirection = cameraTransform.forward;
        rayDirection.y -= 0.1;
        const rayEnd = rayStart.add(rayDirection.uniformScale(-this.maxHitDistance));
        this.performHitTest(rayStart, rayEnd);
    }

    /** Computes every anchor-placement predicate once per hit so the hint,
     *  validity gate, and anchor-creation paths don't each re-scan all anchors. */
    private evaluatePlacement(s: IdentifiedSurface): PlacementEval {
        const needed = this.isSurfaceNeeded(s.surfaceType);
        const farFromAnchors = this.farEnoughFromOtherAnchors(s.position);
        const farFromDoor = this.farEnoughFromDoor(s.position);
        const closeToFloor = s.surfaceType !== "ground" || this.closeEnoughToFloorLevel(s.position);
        return {
            needed,
            farFromAnchors,
            farFromDoor,
            closeToFloor,
            valid: needed && farFromAnchors && farFromDoor && closeToFloor,
        };
    }

    private isSurfaceNeeded(surfaceType: "wall" | "ground" | "ceiling"): boolean {
        let groundCount = 0, wallCount = 0, ceilingCount = 0;
        for (const anchor of global.surfaceAnchors) {
            if (anchor.surfaceType === "ground") groundCount++;
            else if (anchor.surfaceType === "wall") wallCount++;
            else if (anchor.surfaceType === "ceiling") ceilingCount++;
        }
        switch (surfaceType) {
            case "ground":  return (1 + groundCount)  <= this.groundAnchorsTarget;
            case "wall":    return (1 + wallCount)    <= this.wallAnchorsTarget;
            case "ceiling": return (1 + ceilingCount) <= this.ceilingAnchorsTarget;
        }
    }

    private closeEnoughToFloorLevel(position: vec3): boolean {
        const flatPosition = new vec3(0, position.y, 0);
        const floorPosition = new vec3(0, this.groundHeight ?? 0, 0);
        const distanceToFloor = flatPosition.distance(floorPosition);
        return distanceToFloor < this.groundAnchorLevelPrecision;
    }

    private farEnoughFromOtherAnchors(position: vec3): boolean {
        if (global.surfaceAnchors.length === 0) return true;
        for (const anchor of global.surfaceAnchors) {
            const distance = position.distance(anchor.position);
            if (distance <= this.maxDistanceToOtherAnchors) return false;
        }
        return true;
    }

    private farEnoughFromDoor(position: vec3): boolean {
        if (!this.exitDoor) return true;
        const flatPosition = new vec3(position.x, 0, position.z);
        const flatDoorPosition = new vec3(this.exitDoor.position.x, 0, this.exitDoor.position.z);
        const distanceToDoor = flatPosition.distance(flatDoorPosition);
        return distanceToDoor > this.maxDistanceToOtherAnchors;
    }

    private displayAnchorHint(s: IdentifiedSurface, e: PlacementEval): void {
        if (e.needed) {
            if (!e.farFromAnchors) this.newHint("Too close to another anchor.");
            else if (!e.farFromDoor) this.newHint("Too close to escape door.");
            else if (!e.closeToFloor) this.newHint("Ground anchor too far from floor.");
            else this.clearHint();
        } else {
            this.newHint("You already have enough " + s.surfaceType + " anchors.");
        }
    }

    private newHint(hintText: string): void {
        if (this.currentHint === hintText) return;
        this.currentHint = hintText;
        (this.gameFlow as unknown as GameFlowCallback).updateAnchorRequirementsHint();
    }

    private clearHint(): void {
        this.currentHint = "";
        (this.gameFlow as unknown as GameFlowCallback).updateAnchorRequirementsHint();
    }

    private createIfAnchorIsNeeded(identifiedSurface: IdentifiedSurface, cameraPosition: vec3, placement: PlacementEval): boolean {
        if (!placement.valid) return false;

        const dir = cameraPosition.sub(identifiedSurface.position);
        dir.y = 0;
        const dirN = dir.normalize();

        const flatQuat = quat.lookAt(dirN, vec3.up());

        const newSurfaceAnchor = this.anchorPrefab.instantiate(this.anchorVisualsRoot);
        newSurfaceAnchor.getTransform().setWorldPosition(identifiedSurface.position);

        if (identifiedSurface.surfaceType === "ground") {
            newSurfaceAnchor.getTransform().setWorldRotation(flatQuat);
        } else {
            newSurfaceAnchor.getTransform().setWorldRotation(identifiedSurface.rotation);
        }

        // Clone position/normal: identifySurfaceType returns/mutates references
        // tied to the transient hit result, so store independent copies.
        const storedPos = new vec3(identifiedSurface.position.x, identifiedSurface.position.y, identifiedSurface.position.z);
        if (identifiedSurface.surfaceType === "wall") {
            const n = identifiedSurface.normal;
            global.surfaceAnchors.push({
                surfaceType: "wall",
                position: storedPos,
                normal: new vec3(n.x, n.y, n.z),
                anchorObject: newSurfaceAnchor,
            });
        } else if (identifiedSurface.surfaceType === "ground") {
            const yaw = Math.atan2(dirN.x, dirN.z);
            global.surfaceAnchors.push({
                surfaceType: "ground",
                position: storedPos,
                yaw,
                anchorObject: newSurfaceAnchor,
            });
        } else {
            const yawC = Math.atan2(dirN.x, dirN.z);
            global.surfaceAnchors.push({
                surfaceType: "ceiling",
                position: storedPos,
                yaw: yawC,
                anchorObject: newSurfaceAnchor,
            });
        }

        (this.gameFlow as unknown as GameFlowCallback).updateAnchorRequirementsHint();
        return true;
    }

    private onHitTestResult(results: WorldQueryHitTestResult | null): void {
        const cameraPosition = this.getCameraPosition();

        if (results == null || this.maxHitDistance < Math.abs(cameraPosition.distance(results.position))) {
            this.scaleEvent(0, 0.1);
            if (this.currentlyRecording === "poi-anchors") {
                this.newHint("No surface detected. Try getting closer.");
            }
            return;
        }

        const identifiedSurface = this.identifySurfaceType(results.position, results.normal);

        this.worldGridMaterial.mainPass.verticalMode = identifiedSurface.surfaceType === "wall";

        if (this.currentlyRecording === "ground-height" && identifiedSurface.surfaceType !== "ground") {
            this.scaleEvent(0, 0.1); return;
        } else if (this.currentlyRecording === "ground-height") {
            this.scaleEvent(1, 0.1);
        }

        if (this.currentlyRecording === "exit-door" && identifiedSurface.surfaceType !== "wall") {
            this.scaleEvent(0, 0.1); return;
        } else if (this.currentlyRecording === "exit-door") {
            this.scaleEvent(1, 0.1);
        }

        let placement: PlacementEval | null = null;
        if (this.currentlyRecording === "poi-anchors") {
            placement = this.evaluatePlacement(identifiedSurface);
            this.displayAnchorHint(identifiedSurface, placement);
            if (!placement.valid) {
                this.scaleEvent(0, 0.1); return;
            } else {
                this.scaleEvent(1, 0.1);
            }
        }

        this.hitOriginObject.getTransform().setWorldPosition(identifiedSurface.position);
        this.hitOriginObject.getTransform().setWorldRotation(identifiedSurface.rotation);

        if (this.pinchingAir() || this.measureButton) {
            this.measureButton = false;

            switch (this.currentlyRecording) {
                case "ground-height":
                    this.groundHeight = identifiedSurface.position.y;
                    global.groundHeight = this.groundHeight;
                    const groundPos = this.groundPlane.getTransform().getWorldPosition();
                    this.groundPlane.getTransform().setWorldPosition(
                        new vec3(groundPos.x, identifiedSurface.position.y, groundPos.z)
                    );
                    if (typeof this.recordingData.callback === "function") this.recordingData.callback();
                    break;

                case "exit-door": {
                    const dp = identifiedSurface.position;
                    const dn = identifiedSurface.normal;
                    this.exitDoor = {
                        position: new vec3(dp.x, dp.y, dp.z),
                        normal: new vec3(dn.x, dn.y, dn.z),
                    };
                    if (typeof this.recordingData.callback === "function") this.recordingData.callback();
                    break;
                }

                case "poi-anchors":
                    if (!this.createIfAnchorIsNeeded(identifiedSurface, cameraPosition, placement ?? this.evaluatePlacement(identifiedSurface))) return;
                    break;
            }

            this.recordingData.completed = (this.recordingData.completed ?? 0) + 1;
            if (
                this.currentlyRecording === "poi-anchors" &&
                this.recordingData.objective === global.surfaceAnchors.length
            ) {
                this.scaleEvent(0, 0.1);
                if (this.recordingData.callback != null) {
                    this.recordingData.callback();
                    if (this.currentlyRecording === "poi-anchors") {
                        this.clearHint();
                    }
                }
            }
        }
    }

    private measure(): void {
        this.measureButton = true;
        global.utils.delay(0.1, () => { this.measureButton = false; });
    }
}
