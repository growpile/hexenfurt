// Sound playback: background loops at start and on-demand spatial sounds with
// distance falloff. Tracks instances so they can be stopped by id.
// Exposed as global.soundManager.

@typedef
export class BackgroundSoundDef {
    @input
    @label("Sound Asset")
    soundAsset!: AudioTrackAsset;

    @input("float", "1.0")
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    volume: number = 1.0;
}

@typedef
export class SpatialSoundDef {
    @input
    @label("Sound ID")
    soundId: string = "";

    @input
    @label("Sound Asset")
    soundAsset!: AudioTrackAsset;

    @input("float", "1.0")
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    volume: number = 1.0;
}

interface SpatialSoundEntry {
    so: SceneObject;
    audio: AudioComponent;
    parent: SceneObject;
    soundId: string;
}

/** Spectacles UIKit elements (buttons, sliders, switches, etc.) that expose `playAudio`. */
interface UIKitPlayAudioControl {
    playAudio?: boolean;
}

@component
export class SoundManager extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Prefabs</span>")
    @input
    @hint("Prefab used to spawn one-shot (non-spatial) sounds. Must contain a single AudioComponent.")
    public backgroundSoundPrefab!: ObjectPrefab;

    @input
    @hint("Prefab used to spawn spatial sounds. Must contain a single AudioComponent configured for spatial audio.")
    public spatialSoundPrefab!: ObjectPrefab;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Spatial Distance</span>")
    @input
    public minDistance: number = 0;

    @input
    public maxDistance: number = 1000;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Background Sounds</span>")
    @input
    @label("Background Sounds")
    public backgroundSounds: BackgroundSoundDef[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Spatial Sounds</span>")
    @input
    @label("Spatial Sound List")
    public spatialSoundList: SpatialSoundDef[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>UIKit Audio</span>")
    @input
    @label("Play-Audio Controls")
    @hint("UIKit buttons, sliders, switches, scroll bars, etc. Master volume 0 disables playAudio on all; above 0 enables.")
    public uiKitPlayAudioControls: ScriptComponent[] = [];
    @ui.group_end

    private savedBackgroundSounds: AudioComponent[] = [];
    private baseBackgroundVolumes: number[] = [];
    private activeSpatial: SpatialSoundEntry[] = [];
    private masterVolume: number = 1;

    onAwake(): void {
        const api: HexenfurtSoundManager = {
            setMasterVolume: (v) => this.setMasterVolume(v),
            getMasterVolume: () => this.getMasterVolume(),
            setBackgroundVolume: (id, v) => this.setBackgroundVolume(id, v),
            playSpatialSound: (so, soundId, volume, times) => this.playSpatialSound(so, soundId, volume, times),
            playSound: (soundId, volume) => this.playSound(soundId, volume),
            stopSpatialSound: (so, soundId) => this.stopSpatialSound(so, soundId),
            stopSpatialSoundById: (soundId) => this.stopSpatialSoundById(soundId),
            stopAllSpatialSounds: () => this.stopAllSpatialSounds(),
        };
        global.soundManager = api;

        this.createEvent("OnStartEvent").bind(() => {
            this.spawnBackgroundSounds();
            if (global.persistentStorage?.getMasterVolume) {
                this.setMasterVolume(global.persistentStorage.getMasterVolume());
            }
        });
    }

    private spawnBackgroundSounds(): void {
        for (let s = 0; s < this.backgroundSounds.length; s++) {
            const def = this.backgroundSounds[s];
            if (!def || !def.soundAsset) continue;
            const inst = this.backgroundSoundPrefab.instantiate(this.getSceneObject());
            const audio = inst.getComponent("Component.AudioComponent");
            audio.playbackMode = Audio.PlaybackMode.LowPower;
            audio.audioTrack = def.soundAsset;
            const baseVol = def.volume;
            audio.volume = baseVol * this.masterVolume;
            audio.play(-1);
            this.savedBackgroundSounds.push(audio);
            this.baseBackgroundVolumes.push(baseVol);
        }
    }

    public getMasterVolume(): number {
        return this.masterVolume;
    }

    public setMasterVolume(volume: number): void {
        this.masterVolume = Math.min(1, Math.max(0, +volume || 0));
        for (let i = 0; i < this.savedBackgroundSounds.length; i++) {
            const base = this.baseBackgroundVolumes[i] ?? this.savedBackgroundSounds[i].volume;
            this.savedBackgroundSounds[i].volume = base * this.masterVolume;
        }
        this.syncUIKitPlayAudio();
    }

    /** Toggle UIKit `playAudio` on every assigned control from master volume. */
    private syncUIKitPlayAudio(): void {
        const enabled = this.masterVolume > 0;
        for (let i = 0; i < this.uiKitPlayAudioControls.length; i++) {
            const comp = this.uiKitPlayAudioControls[i];
            if (!comp) continue;
            const api = comp as unknown as UIKitPlayAudioControl;
            if (typeof api.playAudio === "undefined" && !("playAudio" in api)) continue;
            api.playAudio = enabled;
        }
    }

    public setBackgroundVolume(id: number, volume: number): void {
        if (id < 0 || id >= this.savedBackgroundSounds.length) return;
        this.baseBackgroundVolumes[id] = volume;
        this.savedBackgroundSounds[id].volume = volume * this.masterVolume;
    }

    private getSpatialAsset(soundId: string): AudioTrackAsset | null {
        for (let i = 0; i < this.spatialSoundList.length; i++) {
            if (this.spatialSoundList[i].soundId === soundId) {
                return this.spatialSoundList[i].soundAsset;
            }
        }
        return null;
    }

    private getSpatialDef(soundId: string): SpatialSoundDef | null {
        for (let i = 0; i < this.spatialSoundList.length; i++) {
            if (this.spatialSoundList[i].soundId === soundId) {
                return this.spatialSoundList[i];
            }
        }
        return null;
    }

    private applyDistanceSettings(audio: AudioComponent): void {
        try {
            const sa: any = (audio as any).spatialAudio;
            if (sa && sa.distanceEffect) {
                if (this.minDistance !== undefined) sa.distanceEffect.minDistance = this.minDistance;
                if (this.maxDistance !== undefined) sa.distanceEffect.maxDistance = this.maxDistance;
            }
        } catch (e) {
            print("soundManager: could not apply distance settings: " + e);
        }
    }

    private placePrefabXZ(prefabSO: SceneObject, sourceSO: SceneObject): void {
        if (!prefabSO || !sourceSO) return;
        const srcPos = sourceSO.getTransform().getWorldPosition();
        const tf = prefabSO.getTransform();
        const cur = tf.getWorldPosition();
        tf.setWorldPosition(new vec3(srcPos.x, cur.y, srcPos.z));
    }

    private destroyEntry(entry: SpatialSoundEntry | null | undefined): void {
        if (!entry) return;
        try {
            if (entry.audio && entry.audio.isPlaying && entry.audio.isPlaying()) {
                entry.audio.stop(false);
            }
        } catch (e) {
            print("soundManager: error stopping audio during teardown: " + e);
        }
        try {
            if (entry.so) entry.so.destroy();
        } catch (e) {
            print("soundManager: error destroying sound object during teardown: " + e);
        }
    }

    public playSpatialSound(sceneObject: SceneObject, soundId: string, volume?: number, times?: number): SceneObject | null {
        if (!this.spatialSoundPrefab) { print("soundManager: spatialSoundPrefab missing"); return null; }
        if (!sceneObject) { print("soundManager: playSpatialSound requires a sceneObject"); return null; }

        const asset = this.getSpatialAsset(soundId);
        if (!asset) { print("soundManager: unknown soundId '" + soundId + "'"); return null; }

        const inst = this.spatialSoundPrefab.instantiate(this.getSceneObject());
        if (!inst) { print("soundManager: failed to instantiate spatial prefab"); return null; }

        this.placePrefabXZ(inst, sceneObject);

        const audio = inst.getComponent("Component.AudioComponent");
        if (!audio) { print("soundManager: prefab missing AudioComponent"); inst.destroy(); return null; }
        audio.playbackMode = Audio.PlaybackMode.LowLatency;
        audio.audioTrack = asset;
        const defVol = typeof volume === "number" ? volume : (this.getSpatialDef(soundId)?.volume ?? 1);
        audio.volume = defVol * this.masterVolume;
        this.applyDistanceSettings(audio);

        const playTimes = (times === undefined || times === null) ? 1 : times;
        audio.play(playTimes);

        try { inst.name = "SpatialSound_" + soundId; } catch (e) {}

        const entry: SpatialSoundEntry = { so: inst, audio, parent: sceneObject, soundId };
        this.activeSpatial.push(entry);

        // One-shot (finite, positive `times`) instances are rarely paired with a
        // stopSpatialSound* call, so auto-clean them when playback finishes.
        // Looping sounds (times < 0) stay tracked for stop-by-id.
        if (playTimes > 0) {
            audio.setOnFinish(() => {
                const idx = this.activeSpatial.indexOf(entry);
                if (idx >= 0) this.activeSpatial.splice(idx, 1);
                this.destroyEntry(entry);
            });
        }

        return inst;
    }

    public playSound(soundId: string, _volume?: number): void {
        const def = this.getSpatialDef(soundId);
        if (!def) { print("soundManager: unknown soundId '" + soundId + "'"); return; }
        const inst = this.backgroundSoundPrefab.instantiate(this.getSceneObject());
        const audio = inst.getComponent("Component.AudioComponent");
        audio.playbackMode = Audio.PlaybackMode.LowLatency;
        audio.audioTrack = def.soundAsset;
        audio.volume = def.volume * this.masterVolume;
        audio.setOnFinish(() => {
            try {
                if (audio.isPlaying && audio.isPlaying()) audio.stop(false);
            } catch (e) {
                print("soundManager: error stopping one-shot sound: " + e);
            }
            try { inst.destroy(); } catch (e) {
                print("soundManager: error destroying one-shot sound: " + e);
            }
        });
        audio.play(1);
    }

    public stopSpatialSound(object: SceneObject, soundId: string): void {
        if (!this.activeSpatial.length) return;
        for (let i = this.activeSpatial.length - 1; i >= 0; i--) {
            const e = this.activeSpatial[i];
            if (e.parent === object && e.soundId === soundId) {
                this.destroyEntry(e);
                this.activeSpatial.splice(i, 1);
            }
        }
    }

    public stopSpatialSoundById(soundId: string): void {
        if (!this.activeSpatial.length) return;
        for (let i = this.activeSpatial.length - 1; i >= 0; i--) {
            const e = this.activeSpatial[i];
            if (e.soundId === soundId) {
                this.destroyEntry(e);
                this.activeSpatial.splice(i, 1);
            }
        }
    }

    public stopAllSpatialSounds(): void {
        for (let i = this.activeSpatial.length - 1; i >= 0; i--) {
            this.destroyEntry(this.activeSpatial[i]);
        }
        this.activeSpatial.length = 0;
    }
}
