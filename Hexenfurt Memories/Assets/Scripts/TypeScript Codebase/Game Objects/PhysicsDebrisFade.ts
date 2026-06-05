/** Fades cloned material opacities 1→0, then disables and destroys target objects. */

export const PHYSICS_DEBRIS_FADE_SEC = 2;
export const PHYSICS_DEBRIS_DESTROY_DELAY_SEC = 0.2;

function setMaterialOpacity(material: Material, opacity: number): void {
    const pass = material.mainPass as any;
    pass.opacity = opacity;
    const baseColor = pass.baseColor;
    if (baseColor) {
        pass.baseColor = new vec4(baseColor.x, baseColor.y, baseColor.z, opacity);
    }
}

/** Clone material for debris fade; enables alpha blend when the shader was opaque-only. */
export function cloneMaterialForDebrisFade(rmv: RenderMeshVisual): Material {
    const mat = rmv.getMaterial(0).clone();
    rmv.clearMaterials();
    rmv.addMaterial(mat);
    const pass = mat.mainPass as any;
    setMaterialOpacity(mat, 1);
    if (pass.blendMode === BlendMode.Disabled) {
        pass.blendMode = BlendMode.PremultipliedAlphaAuto;
    }
    return mat;
}

export function fadeMaterialsAndDestroy(
    host: ScriptComponent,
    materials: Material[],
    targets: SceneObject[],
    fadeSec: number = PHYSICS_DEBRIS_FADE_SEC,
    destroyDelaySec: number = PHYSICS_DEBRIS_DESTROY_DELAY_SEC
): void {
    if (materials.length === 0 || targets.length === 0) return;

    const start = getTime();
    const updateEvt = host.createEvent("UpdateEvent");
    updateEvt.bind(() => {
        const t = Math.min((getTime() - start) / fadeSec, 1);
        const opacity = 1 - t;
        for (let i = 0; i < materials.length; i++) {
            setMaterialOpacity(materials[i], opacity);
        }
        if (t < 1) return;

        updateEvt.enabled = false;
        for (let i = 0; i < targets.length; i++) {
            targets[i].enabled = false;
        }
        global.utils.delay(destroyDelaySec, () => {
            for (let i = 0; i < targets.length; i++) {
                if (targets[i]) targets[i].destroy();
            }
        });
    });
}
