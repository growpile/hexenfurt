script.delayedCallbacks = [];

var newMat = script.getSceneObject().getChild(1).getComponent('Component.MaterialMeshVisual').getMaterial(0).clone();
script.getSceneObject().getChild(1).getComponent('Component.MaterialMeshVisual').clearMaterials();
script.getSceneObject().getChild(1).getComponent('Component.MaterialMeshVisual').addMaterial(newMat);

script.delay = function(delay, callback) {
    if (typeof callback !== "function") return;
    var delayedEvent = script.createEvent("DelayedCallbackEvent");
    delayedEvent.bind(function (eventData) {
        var index = script.delayedCallbacks.indexOf(callback);
        if (index > -1) {
            script.delayedCallbacks.splice(index, 1);
        }
        callback();
    });
    delayedEvent.reset(delay);
};

function removeFirstInstanceBySceneObject(array, sceneObject) {
    var index = array.findIndex(function(obj) {
        return obj.anchorObject === sceneObject;
    });
    if (index !== -1) {
        array.splice(index, 1);
    }
    return array;
}

script.destroyAnchor = function() {
    print(" Surface Anchor destroyed!");
    global.surfaceAnchors = removeFirstInstanceBySceneObject(global.surfaceAnchors, script.getSceneObject());
    global.removedAnchor();

    script.delay(0.1, function() {
        script.getSceneObject().destroy();
    })
}