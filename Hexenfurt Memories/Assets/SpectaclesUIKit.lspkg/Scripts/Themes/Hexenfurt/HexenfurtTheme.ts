import {Style} from "../Style"
import {Theme} from "../Theme"
import {HexenfurtCapsuleButtonParameters} from "./HexenfurtCapsuleButtonParameters"
import {HexenfurtRectangleButtonParameters} from "./HexenfurtRectangleButtonParameters"
import {HexenfurtRoundButtonParameters} from "./HexenfurtRoundButtonParameters"

export const HexenfurtTheme: Theme = {
  get name(): string {
    return "Hexenfurt"
  },
  get styles(): Record<string, Record<string, Style>> {
    return {
      RoundButton: HexenfurtRoundButtonParameters,
      RectangleButton: HexenfurtRectangleButtonParameters,
      CapsuleButton: HexenfurtCapsuleButtonParameters
    }
  }
}
