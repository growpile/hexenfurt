//@input Asset.ObjectPrefab backgroundSoundPrefab
/** @type {ObjectPrefab} */
var backgroundSoundPrefab = script.backgroundSoundPrefab;
//@input Asset.ObjectPrefab spatialSoundPrefab
/** @type {ObjectPrefab} */
var spatialSoundPrefab = script.spatialSoundPrefab;
//@input float minDistance
/** @type {number} */
var minDistance = script.minDistance;
//@input float maxDistance
/** @type {number} */
var maxDistance = script.maxDistance;
/*
@typedef backgroundSoundClass
@property {Asset.AudioTrackAsset} soundAsset
@property {float} volume = 1.0 {"widget":"slider", "min":0.0, "max":1.0, "step":0.01}
*/
//@input backgroundSoundClass[] backgroundSounds
var backgroundSounds = script.backgroundSounds;

/*
@typedef spatialSoundClass
@property {string} soundId {"label": "Sound ID"}
@property {Asset.AudioTrackAsset} soundAsset
@property {float} volume = 1.0 {"widget":"slider", "min":0.0, "max":1.0, "step":0.01}
*/
// @input spatialSoundClass[] spatialSoundList
var spatialSoundList = script.spatialSoundList;

var savedBackgroundSounds = [];

script.createEvent("OnStartEvent").bind(function() {
    for(let s = 0; s < backgroundSounds.length; s++) {
        if(backgroundSounds[s].soundAsset) {
            var backgroundSound = backgroundSoundPrefab.instantiate(script.getSceneObject());
            var audioComponent = backgroundSound.getComponent('Component.AudioComponent');
            audioComponent.playbackMode = Audio.PlaybackMode.LowPower;
            audioComponent.audioTrack = backgroundSounds[s].soundAsset
            audioComponent.volume = backgroundSounds[s].volume
            audioComponent.play(-1); // play forever
            savedBackgroundSounds.push(audioComponent);
        }
    }
});

// Ensure we have a self object
var self = global.soundManager || {};
global.soundManager = self;

self.setBackgroundVolume = function(id, volume) {
    print(id);
    print(savedBackgroundSounds);
    savedBackgroundSounds[id].volume = volume;
}

// Active spatial instances we spawned
var _activeSpatial = []; // [{ so, audio, parent, soundId }]

// Helper: find AudioTrackAsset by soundId
function _getSpatialAsset(id) {
    if (!spatialSoundList) return null;
    for (var i = 0; i < spatialSoundList.length; i++) {
        if (spatialSoundList[i].soundId === id) {
            return spatialSoundList[i].soundAsset;
        }
    }
    return null;
}

function _applyDistanceSettings(audio) {
    try {
        if (audio && audio.spatialAudio && audio.spatialAudio.distanceEffect) {
            if (script.minDistance !== undefined) {
                audio.spatialAudio.distanceEffect.minDistance = script.minDistance;
            }
            if (script.maxDistance !== undefined) {
                audio.spatialAudio.distanceEffect.maxDistance = script.maxDistance;
            }
        }
    } catch (e) {
        print("soundManager: could not apply distance settings: " + e);
    }
}

function _placePrefabXZ(prefabSO, sourceSO) {
    if (!prefabSO || !sourceSO) return;
    var srcPos = sourceSO.getTransform().getWorldPosition();
    var tf = prefabSO.getTransform();
    var cur = tf.getWorldPosition();
    // match XZ to the source object; keep prefab's current Y
    tf.setWorldPosition(new vec3(srcPos.x, cur.y, srcPos.z));
}

function _destroyEntry(entry) {
    if (!entry) return;
    try {
        if (entry.audio && entry.audio.isPlaying && entry.audio.isPlaying()) {
            // false = do not fade out (stop immediately)
            entry.audio.stop(false);
        }
    } catch (e) {}
    try {
        if (entry.so) { entry.so.destroy(); }
    } catch (e) {}
}

// ---------------------------------------------
// API
// ---------------------------------------------
self.playSpatialSound = function(sceneObject, soundId, volume, times) {
    if (!spatialSoundPrefab) { print("soundManager: spatialSoundPrefab missing"); return null; }
    if (!sceneObject) { print("soundManager: playSpatialSound requires a sceneObject"); return null; }

    var asset = _getSpatialAsset(soundId);
    if (!asset) { print("soundManager: unknown soundId '" + soundId + "'"); return null; }

    var inst = spatialSoundPrefab.instantiate(script.getSceneObject());
    if (!inst) { print("soundManager: failed to instantiate spatial prefab"); return null; }

    // Position the prefab at the caller's XZ world coordinates
    _placePrefabXZ(inst, sceneObject);

    // Configure audio
    var audio = inst.getComponent("Component.AudioComponent");
    if (!audio) { print("soundManager: prefab missing AudioComponent"); inst.destroy(); return null; }
    audio.playbackMode = Audio.PlaybackMode.LowLatency;

    audio.audioTrack = asset;
    if (typeof volume === "number") {
        audio.volume = volume;
    }
    _applyDistanceSettings(audio);

    // Default to 1 play if not provided; allow -1 for infinite
    if (times === undefined || times === null) { times = 1; }
    audio.play(times);

    // Tag & track so we can stop later
    try { inst.name = "SpatialSound_" + soundId; } catch (e) {}
    var entry = { so: inst, audio: audio, parent: sceneObject, soundId: soundId };
    _activeSpatial.push(entry);

    return inst; // return the spawned object in case you want to keep a handle
};

// One-shot (non-spatial) SFX using the background prefab.
// Looks up the clip by soundId from spatialSoundList.

self.playSound = function(soundId, volume) {
    var asset = null;
    for (var i = 0; i < spatialSoundList.length; i++) {
        if (spatialSoundList[i].soundId === soundId) {
            asset = spatialSoundList[i];
            break;
        }
    }
    print("asset is " + asset)
    var inst = backgroundSoundPrefab.instantiate(script.getSceneObject());
    var audio = inst.getComponent("Component.AudioComponent");
    audio.playbackMode = Audio.PlaybackMode.LowLatency;
    audio.audioTrack = asset.soundAsset;
    audio.volume = asset.volume;
    audio.setOnFinish(function(ac) {
        // ac.getSceneObject().destroy();
    })
    audio.play(1);
}

// self.playSound = function(soundId, volume) {
//     print("pss1");
//     if (!backgroundSoundPrefab) { print("soundManager: backgroundSoundPrefab missing"); return null; }

//     // Reuse mapping from spatialSoundList (soundId -> AudioTrackAsset)
//     var asset = null;
//     for (var i = 0; i < spatialSoundList.length; i++) {
//         if (spatialSoundList[i].soundId === soundId) {
//             asset = spatialSoundList[i].soundAsset;
//             break;
//         }
//     }
//     if (!asset) { print("soundManager: unknown soundId '" + soundId + "'"); return null; }
//     print("pss2");
//     // Spawn under this script's SceneObject
//     var inst = backgroundSoundPrefab.instantiate(script.getSceneObject());
//     if (!inst) { print("soundManager: failed to instantiate background prefab"); return null; }

//     print("pss3");
//     // Configure audio
//     var audio = inst.getComponent("Component.AudioComponent");
//     if (!audio) { print("soundManager: prefab missing AudioComponent"); inst.destroy(); return null; }
//     audio.playbackMode = Audio.PlaybackMode.LowLatency;
//     audio.audioTrack = asset;
//     if (typeof volume === "number") { audio.volume = volume; }


//     print("pss4");
//     // Play once
//     audio.play(1);
//     try { inst.name = "OneShotSound_" + soundId; } catch (e) {}

//     // Auto-cleanup when finished
//     var evt = script.createEvent("UpdateEvent");
//     evt.bind(function() {
//         try {
//             if (!audio.isPlaying || !audio.isPlaying()) {
//                 inst.destroy();
//                 evt.enabled = false;
//             }
//         } catch (e) {
//             // If anything goes wrong, make sure we clean up
//             inst.destroy();
//             evt.enabled = false;
//         }
//     });

//     return inst; // handle, if you want it
// };

self.stopSpatialSound = function(object, soundId) {
    if (!_activeSpatial.length) return;
    for (var i = _activeSpatial.length - 1; i >= 0; i--) {
        var e = _activeSpatial[i];
        if (e.parent === object && e.soundId === soundId) {
            _destroyEntry(e);
            _activeSpatial.splice(i, 1);
        }
    }
};

self.stopSpatialSoundById = function( soundId) {
    if (!_activeSpatial.length) return;
    for (var i = _activeSpatial.length - 1; i >= 0; i--) {
        var e = _activeSpatial[i];
        if (e.soundId === soundId) {
            _destroyEntry(e);
            _activeSpatial.splice(i, 1);
        }
    }
};

self.stopAllSpatialSounds = function() {
    for (var i = _activeSpatial.length - 1; i >= 0; i--) {
        _destroyEntry(_activeSpatial[i]);
    }
    _activeSpatial.length = 0;
};