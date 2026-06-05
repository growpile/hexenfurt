import {Style} from "../Style"
import {GhostGradients} from "../SnapOS-2.0/Gradients/GhostGradients"
import {PrimaryGradients} from "../SnapOS-2.0/Gradients/PrimaryGradients"
import {PrimaryNeutralGradients} from "../SnapOS-2.0/Gradients/PrimaryNeutralGradients"
import {SecondaryGradients} from "../SnapOS-2.0/Gradients/SecondaryGradients"
import {SpecialGradients} from "../SnapOS-2.0/Gradients/SpecialGradients"
import {SnapOS2Styles} from "../SnapOS-2.0/SnapOS2"

/** Button styles for Hexenfurt theme; shallower Z motion on hover/press than SnapOS2. */
export const HexenfurtRectangleButtonParameters: Partial<Record<SnapOS2Styles, Style>> = {
  PrimaryNeutral: {
    default: {
      baseType: "Gradient",
      baseGradient: PrimaryNeutralGradients.defaultBackground,
      borderSize: 0.125,
      borderType: "Gradient",
      hasBorder: true,
      borderGradient: PrimaryNeutralGradients.defaultBorder,
      shouldScale: false,
      shouldPosition: true,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    hovered: {
      baseGradient: PrimaryNeutralGradients.hoverBackground,
      borderGradient: PrimaryNeutralGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    triggered: {
      baseGradient: PrimaryNeutralGradients.triggeredBackground,
      borderGradient: PrimaryNeutralGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    toggledDefault: {
      baseGradient: PrimaryNeutralGradients.triggeredBackground,
      borderGradient: PrimaryNeutralGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    toggledHovered: {
      baseGradient: PrimaryNeutralGradients.triggeredBackground,
      borderGradient: PrimaryNeutralGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    toggledTriggered: {
      baseGradient: PrimaryNeutralGradients.triggeredBackground,
      borderGradient: PrimaryNeutralGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    inactive: {
      baseGradient: PrimaryNeutralGradients.darkGrayBackground,
      borderGradient: PrimaryNeutralGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    }
  },
  Primary: {
    default: {
      baseType: "Gradient",
      baseGradient: PrimaryGradients.defaultBackground,
      borderSize: 0.1,
      hasBorder: true,
      borderType: "Gradient",
      borderGradient: PrimaryGradients.defaultBorder,
      shouldScale: false,
      shouldPosition: true,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    hovered: {
      baseGradient: PrimaryGradients.hoverBackground,
      borderGradient: PrimaryGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    triggered: {
      baseGradient: PrimaryGradients.triggeredBackground,
      borderGradient: PrimaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    toggledDefault: {
      baseGradient: PrimaryGradients.triggeredBackground,
      borderGradient: PrimaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    toggledHovered: {
      baseGradient: PrimaryGradients.triggeredBackground,
      borderGradient: PrimaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    toggledTriggered: {
      baseGradient: PrimaryGradients.triggeredBackground,
      borderGradient: PrimaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    inactive: {
      baseGradient: PrimaryGradients.darkGrayBackground,
      borderGradient: PrimaryGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    }
  },
  Secondary: {
    default: {
      baseType: "Gradient",
      baseGradient: SecondaryGradients.defaultBackground,
      borderSize: 0.1,
      hasBorder: true,
      borderType: "Gradient",
      borderGradient: SecondaryGradients.defaultBorder,
      shouldScale: false,
      shouldPosition: true,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    hovered: {
      baseGradient: SecondaryGradients.hoverBackground,
      borderGradient: SecondaryGradients.hoverBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    triggered: {
      baseGradient: SecondaryGradients.triggeredBackground,
      borderGradient: SecondaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    toggledDefault: {
      baseGradient: SecondaryGradients.triggeredBackground,
      borderGradient: SecondaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    toggledHovered: {
      baseGradient: SecondaryGradients.triggeredBackground,
      borderGradient: SecondaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    toggledTriggered: {
      baseGradient: SecondaryGradients.triggeredBackground,
      borderGradient: SecondaryGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    inactive: {
      baseGradient: SecondaryGradients.darkGrayBackground,
      borderGradient: SecondaryGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    }
  },
  Special: {
    default: {
      baseType: "Gradient",
      baseGradient: SpecialGradients.defaultBackground,
      borderSize: 0.1,
      hasBorder: true,
      borderType: "Gradient",
      borderGradient: SpecialGradients.defaultBorder,
      shouldScale: false,
      shouldPosition: true,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    hovered: {
      baseGradient: SpecialGradients.hoverBackground,
      borderGradient: SpecialGradients.hoverBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    triggered: {
      baseGradient: SpecialGradients.triggeredBackground,
      borderGradient: SpecialGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    toggledDefault: {
      baseGradient: SpecialGradients.triggeredBackground,
      borderGradient: SpecialGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    toggledHovered: {
      baseGradient: SpecialGradients.triggeredBackground,
      borderGradient: SpecialGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    toggledTriggered: {
      baseGradient: SpecialGradients.triggeredBackground,
      borderGradient: SpecialGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    inactive: {
      baseGradient: SpecialGradients.darkGrayBackground,
      borderGradient: SpecialGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    }
  },
  Ghost: {
    default: {
      baseType: "Gradient",
      baseGradient: GhostGradients.defaultBackground,
      hasBorder: true,
      borderSize: 0.15,
      borderType: "Gradient",
      borderGradient: GhostGradients.defaultBorder,
      shouldScale: false,
      shouldPosition: true,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    hovered: {
      baseGradient: GhostGradients.hoverBackground,
      borderGradient: GhostGradients.hoverBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, -0.25)
    },
    triggered: {
      baseGradient: GhostGradients.triggeredBackground,
      borderGradient: GhostGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, -0.5)
    },
    toggledDefault: {
      baseGradient: GhostGradients.triggeredBackground,
      borderGradient: GhostGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    },
    toggledHovered: {
      baseGradient: GhostGradients.triggeredBackground,
      borderGradient: GhostGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.55)
    },
    toggledTriggered: {
      baseGradient: GhostGradients.triggeredBackground,
      borderGradient: GhostGradients.triggeredBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0.28)
    },
    inactive: {
      baseGradient: GhostGradients.darkGrayBackground,
      borderGradient: GhostGradients.defaultBorder,
      localScale: new vec3(1, 1, 1),
      localPosition: new vec3(0, 0, 0)
    }
  }
}
