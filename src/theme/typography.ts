import { TextStyle } from 'react-native';
import { fonts } from './theme';

/**
 * The type scale for forms: Add and Edit Outlet, and the Input and
 * SelectField fields they're built from. Font, size and spacing only; each
 * use picks its colour from the theme.
 */
export const typography = {
  /** A field's label: small, bold, uppercase. */
  fieldLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' } as TextStyle,
  /** What's typed or picked in a field. */
  inputText: { fontFamily: fonts.regular, fontSize: 15 } as TextStyle,
  /** A card's main line, or a small button's label. */
  body: { fontFamily: fonts.semibold, fontSize: 13 } as TextStyle,
  /** Supporting text under a line. */
  caption: { fontFamily: fonts.regular, fontSize: 12 } as TextStyle,
  /** A card's heading. */
  title: { fontFamily: fonts.bold, fontSize: 15 } as TextStyle,
};
