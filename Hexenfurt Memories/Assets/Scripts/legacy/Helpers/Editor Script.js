//@input SceneObject editorObject
/** @type {SceneObject} */
var editorObject = script.editorObject;

script.createEvent("OnStartEvent").bind(function(eventData){
    if(global.deviceInfoSystem.isEditor()) {
        editorObject.enabled = true;
    } else {
        editorObject.enabled = false;
    }
});