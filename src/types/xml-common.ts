/**
 * Shared base types for parsed XML trees (fast-xml-parser output).
 *
 * XmlNode represents any node in a parsed XML object tree.
 * XmlValue represents a leaf value (fast-xml-parser returns strings for text content).
 */

/** A leaf value from fast-xml-parser — typically a string, sometimes number, or absent */
export type XmlValue = string | number | undefined;

/** A generic node in a parsed XML tree */
export type XmlNode = Record<string, unknown>;
