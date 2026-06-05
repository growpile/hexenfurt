//@input Component.ScriptComponent arrowInteractable
/** @type {ScriptComponent} */
var arrowInteractable = script.arrowInteractable;
//@input Component.ScriptComponent arrowManipulation
/** @type {ScriptComponent} */
var arrowManipulation = script.arrowManipulation;
//@input SceneObject arrowDriver
/** @type {SceneObject} */
var arrowDriver = script.arrowDriver;
//@input SceneObject arrowDriver
/** @type {SceneObject} */
var arrowDriver = script.arrowDriver;
//@input SceneObject arrowOrigin
/** @type {SceneObject} */
var arrowOrigin = script.arrowOrigin;

script.createEvent("OnStartEvent").bind(() => {

    arrowManipulation.onManipulationUpdate.add(function() {
        // lock the arrowInteractable scene object's Z position to 0
        var arrowDriverTransform = arrowDriver.getTransform();
        var arrowInteractableTransform = script.getSceneObject().getTransform();

        // var currentDriverPos = arrowTransform.getLocalPosition();
        var currentInteractablePos = arrowInteractableTransform.getLocalPosition();

        arrowDriverTransform.setLocalPosition(new vec3(currentInteractablePos.x, currentInteractablePos.y, 0) );
    });

    arrowManipulation.onManipulationEnd.add(function() {
        // reset the interactable position to match the driver position
        var arrowOriginTransform = arrowOrigin.getTransform();
        var arrowInteractableTransform = script.getSceneObject().getTransform();
        var originPos = arrowOriginTransform.getWorldPosition();

        arrowInteractableTransform.setWorldPosition(originPos);
    });
});