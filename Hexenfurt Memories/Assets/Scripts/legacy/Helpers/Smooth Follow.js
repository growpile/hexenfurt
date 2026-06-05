//@input SceneObject objectToFollow
/** @type {SceneObject} */
var objectToFollow = script.objectToFollow;
//@input float speed
/** @type {number} */
var speed = script.speed;
//@input bool copyPosition
/** @type {boolean} */
var copyPosition = script.copyPosition;
//@input bool copyRotation
/** @type {boolean} */
var copyRotation = script.copyRotation;

const selfTransform = script.getTransform();
const targetTransform = objectToFollow.getTransform();

script.createEvent("UpdateEvent").bind(function() {
    if(copyPosition) {
        var currentSelfPosition = selfTransform.getWorldPosition();
        var currentTargetPosition = targetTransform.getWorldPosition();
        selfTransform.setWorldPosition(vec3.lerp(currentSelfPosition, currentTargetPosition, speed));
    }

    if(copyRotation) {
        var currentSelfRotation = selfTransform.getWorldRotation();
        var currentTargetRotation = targetTransform.getWorldRotation();
        selfTransform.setWorldRotation(quat.slerp(currentSelfRotation, currentTargetRotation, speed));
    }
})