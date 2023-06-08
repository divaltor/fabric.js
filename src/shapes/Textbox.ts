// @ts-nocheck
import type { TClassProperties } from '../typedefs';
import { IText } from './IText/IText';
import { classRegistry } from '../ClassRegistry';
import { createTextboxDefaultControls } from '../controls/commonControls';
import { JUSTIFY } from './Text/constants';
import type { GraphemeBBox } from './Text/Text';

// @TODO: Many things here are configuration related and shouldn't be on the class nor prototype
// regexes, list of properties that are not suppose to change by instances, magic consts.
// this will be a separated effort
export const textboxDefaultValues: Partial<TClassProperties<Textbox>> = {
  minWidth: 20,
  dynamicMinWidth: 2,
  lockScalingFlip: true,
  noScaleCache: false,
  _wordJoiners: /[ \t\r]/,
  splitByGrapheme: false,
};

/**
 * Textbox class, based on IText, allows the user to resize the text rectangle
 * and wraps lines automatically. Textboxes have their Y scaling locked, the
 * user can only change width. Height is adjusted automatically based on the
 * wrapping of lines.
 */
export class Textbox extends IText {
  /**
   * Minimum width of textbox, in pixels.
   * @type Number
   * @default
   */
  declare minWidth: number;

  /**
   * Minimum calculated width of a textbox, in pixels.
   * fixed to 2 so that an empty textbox cannot go to 0
   * and is still selectable without text.
   * @type Number
   * @default
   */
  declare dynamicMinWidth: number;

  /**
   * Use this boolean property in order to split strings that have no white space concept.
   * this is a cheap way to help with chinese/japanese
   * @type Boolean
   * @since 2.6.0
   */
  declare splitByGrapheme: boolean;

  static textLayoutProperties = [...IText.textLayoutProperties, 'width'];

  static ownDefaults: Record<string, any> = textboxDefaultValues;

  static getDefaults() {
    return {
      ...super.getDefaults(),
      controls: createTextboxDefaultControls(),
      ...Textbox.ownDefaults,
    };
  }

  /**
   * Unlike superclass's version of this function, Textbox does not update
   * its width.
   * @private
   * @override
   */
  initDimensions() {
    if (!this.initialized) {
      return;
    }
    this.isEditing && this.initDelayedCursor();
    this._clearCache();
    // clear dynamicMinWidth as it will be different after we re-wrap line
    this.dynamicMinWidth = 0;
    // wrap lines
    this._styleMap = this._generateStyleMap(this._splitText());
    // if after wrapping, the width is smaller than dynamicMinWidth, change the width and re-wrap
    if (this.dynamicMinWidth > this.width) {
      this._set('width', this.dynamicMinWidth);
    }
    if (this.textAlign.includes(JUSTIFY)) {
      // once text is measured we need to make space fatter to make justified text.
      this.enlargeSpaces();
    }
    // clear cache and re-calculate height
    this.height = this.calcTextHeight();
  }

  /**
   * Generate an object that translates the style object so that it is
   * broken up by visual lines (new lines and automatic wrapping).
   * The original text styles object is broken up by actual lines (new lines only),
   * which is only sufficient for Text / IText
   * @private
   */
  _generateStyleMap(textInfo) {
    let realLineCount = 0,
      realLineCharCount = 0,
      charCount = 0;
    const map = {};

    for (let i = 0; i < textInfo.graphemeLines.length; i++) {
      if (textInfo.graphemeText[charCount] === '\n' && i > 0) {
        realLineCharCount = 0;
        charCount++;
        realLineCount++;
      } else if (
        !this.splitByGrapheme &&
        this._reSpaceAndTab.test(textInfo.graphemeText[charCount]) &&
        i > 0
      ) {
        // this case deals with space's that are removed from end of lines when wrapping
        realLineCharCount++;
        charCount++;
      }

      map[i] = { line: realLineCount, offset: realLineCharCount };

      charCount += textInfo.graphemeLines[i].length;
      realLineCharCount += textInfo.graphemeLines[i].length;
    }

    return map;
  }

  /**
   * Returns true if object has a style property or has it on a specified line
   * @param {Number} lineIndex
   * @return {Boolean}
   */
  styleHas(property, lineIndex: number): boolean {
    if (this._styleMap && !this.isWrapping) {
      const map = this._styleMap[lineIndex];
      if (map) {
        lineIndex = map.line;
      }
    }
    return super.styleHas(property, lineIndex);
  }

  /**
   * Returns true if object has no styling or no styling in a line
   * @param {Number} lineIndex , lineIndex is on wrapped lines.
   * @return {Boolean}
   */
  isEmptyStyles(lineIndex: number): boolean {
    if (!this.styles) {
      return true;
    }
    let offset = 0,
      nextLineIndex = lineIndex + 1,
      nextOffset,
      shouldLimit = false;
    const map = this._styleMap[lineIndex],
      mapNextLine = this._styleMap[lineIndex + 1];
    if (map) {
      lineIndex = map.line;
      offset = map.offset;
    }
    if (mapNextLine) {
      nextLineIndex = mapNextLine.line;
      shouldLimit = nextLineIndex === lineIndex;
      nextOffset = mapNextLine.offset;
    }
    const obj =
      typeof lineIndex === 'undefined'
        ? this.styles
        : { line: this.styles[lineIndex] };
    for (const p1 in obj) {
      for (const p2 in obj[p1]) {
        if (p2 >= offset && (!shouldLimit || p2 < nextOffset)) {
          // eslint-disable-next-line no-unused-vars
          for (const p3 in obj[p1][p2]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @private
   */
  _getStyleDeclaration(lineIndex: number, charIndex: number) {
    if (this._styleMap && !this.isWrapping) {
      const map = this._styleMap[lineIndex];
      if (!map) {
        return null;
      }
      lineIndex = map.line;
      charIndex = map.offset + charIndex;
    }
    return super._getStyleDeclaration(lineIndex, charIndex);
  }

  /**
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @param {Object} style
   * @private
   */
  _setStyleDeclaration(lineIndex: number, charIndex: number, style: object) {
    const map = this._styleMap[lineIndex];
    lineIndex = map.line;
    charIndex = map.offset + charIndex;

    this.styles[lineIndex][charIndex] = style;
  }

  /**
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @private
   */
  _deleteStyleDeclaration(lineIndex: number, charIndex: number) {
    const map = this._styleMap[lineIndex];
    lineIndex = map.line;
    charIndex = map.offset + charIndex;
    delete this.styles[lineIndex][charIndex];
  }

  /**
   * probably broken need a fix
   * Returns the real style line that correspond to the wrapped lineIndex line
   * Used just to verify if the line does exist or not.
   * @param {Number} lineIndex
   * @returns {Boolean} if the line exists or not
   * @private
   */
  _getLineStyle(lineIndex: number): boolean {
    const map = this._styleMap[lineIndex];
    return !!this.styles[map.line];
  }

  /**
   * Set the line style to an empty object so that is initialized
   * @param {Number} lineIndex
   * @param {Object} style
   * @private
   */
  _setLineStyle(lineIndex: number) {
    const map = this._styleMap[lineIndex];
    this.styles[map.line] = {};
  }

  /**
   * Wraps text using the 'width' property of Textbox. First this function
   * splits text on newlines, so we preserve newlines entered by the user.
   * Then it wraps each line using the width of the Textbox by calling
   * _wrapLine().
   * @param {Array} lines The string array of text that is split into lines
   * @param {Number} desiredWidth width you want to wrap to
   * @returns {Array} Array of lines
   */
  _wrapText(lines: string[], desiredWidth: number, reservedSpace = 0) {
    const wrapped: string[][] = [];
    this.isWrapping = true;
    const { lines: data, minWidth } = this.measureLinesForWrapping(lines);
    const additionalSpace = this._getWidthOfCharSpacing();
    const maxWidth = Math.max(
      desiredWidth - reservedSpace,
      minWidth,
      this.dynamicMinWidth
    );
    if (minWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = minWidth - additionalSpace + reservedSpace;
    }
    for (let i = 0; i < lines.length; i++) {
      wrapped.push(
        ...this._wrapLine(
          { lines: data, minWidth, maxWidth, additionalSpace },
          i
        )
      );
    }
    this.isWrapping = false;
    return wrapped;
  }

  /**
   * Helper function to measure a string of text, given its lineIndex and charIndex offset
   * It gets called when charBounds are not available yet.
   * Override if necessary
   * Use with {@link Textbox#wordSplit}
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {String} text
   * @param {number} lineIndex
   * @param {number} charOffset
   */
  _measureWord(word: string | string[], lineIndex: number, charOffset = 0) {
    let width = 0,
      height = 0;
    const data: GraphemeBBox<false>[] = [];
    for (let i = 0, prevGrapheme: string | undefined; i < word.length; i++) {
      const box = this._getGraphemeBox(
        word[i],
        lineIndex,
        i + charOffset,
        prevGrapheme,
        true
      );
      // TODO: support vertical text
      width += box.kernedWidth;
      height = Math.max(height, box.height);

      data.push(box);
      prevGrapheme = word[i];
    }

    return { width, height, data };
  }

  /**
   * Override this method to customize word splitting
   * Use with {@link Textbox#_measureWord}
   * @param {string} value
   * @returns {string[]} array of words
   */
  wordSplit(value: string): string[] {
    return value.split(this._wordJoiners);
  }

  measureLinesForWrapping(lines: string[]) {
    let min = 0;
    const data = lines.map((line, lineIndex) => {
      const parts = this.splitByGrapheme
        ? this.graphemeSplit(line)
        : this.wordSplit(line);

      if (parts.length === 0) {
        return { parts: [], minWidth: 0 };
      }

      const { data, minWidth } = parts.reduce(
        ({ data, offset, minWidth }, part, index) => {
          let infixWidth = 0;
          let infix: string | null = null;
          if (index > 0 && !this.splitByGrapheme) {
            infix = ' ';
            // measure infix at offset to respect styling etc.
            infixWidth = this._measureWord(infix, lineIndex, offset).width;
            // move cursor after infix
            offset += infix.length;
          }
          // split words if necessary
          const graphemes = !this.splitByGrapheme
            ? this.graphemeSplit(part)
            : // we must use concat for compatibility
              [].concat(part);
          // measure
          const {
            width,
            height,
            data: d,
          } = this._measureWord(graphemes, lineIndex, offset);
          data.push({
            graphemes,
            offset,
            width,
            height,
            data: d,
            infix,
            infixWidth,
          });
          return {
            offset: offset + graphemes.length,
            data,
            minWidth: Math.max(width, minWidth),
          };
        },
        {
          offset: 0,
          data: [] as {
            graphemes: string[];
            offset: number;
            width: number;
            height: number;
            data: GraphemeBBox<false>[];
            /**
             * space to insert before `graphemes`
             */
            infix: string | null;
            infixWidth: number;
          }[],
          minWidth: 0,
        }
      );
      min = Math.max(min, minWidth);
      return { parts: data, minWidth };
    });
    return { lines: data, minWidth: min };
  }

  /**
   * Wraps a line of text using the width of the Textbox and a context.
   * @param {Array} line The grapheme array that represent the line
   * @param {Number} lineIndex
   * @param {Number} desiredWidth width you want to wrap the line to
   * @param {Number} reservedSpace space to remove from wrapping for custom functionalities
   * @returns {Array} Array of line(s) into which the given text is wrapped
   * to.
   *
   * @todo do we need to account for different spacing/offsetting in different languages?
   */
  _wrapLine(
    {
      lines,
      additionalSpace,
      maxWidth: desiredWidth,
    }: ReturnType<this['measureLinesForWrapping']> & {
      maxWidth: number;
      additionalSpace: number;
    },
    lineIndex: number
  ) {
    const { parts: lineData } = lines[lineIndex];

    // fix a difference between split and graphemeSplit
    if (!lineData.length) {
      return [[]];
    }

    // layout
    return lineData.reduce(
      ({ lines, lineWidth }, { graphemes, infix, infixWidth, width }, i) => {
        // `i === 0` => `infixWidth === 0`
        const lineWidthAfter = lineWidth + infixWidth + width;
        if (i === 0 || lineWidthAfter - additionalSpace > desiredWidth) {
          // push a new line, we spread to protect `data` from mutation
          lines.push([...graphemes]);
          lineWidth = width;
        } else {
          const currentLine = lines[lines.length - 1];
          // push infix if necessary, `i === 0 || splitByGrapheme` => `infix === null`
          infix && currentLine.push(infix);
          // push graphemes
          currentLine.push(...graphemes);
          lineWidth = lineWidthAfter;
        }
        return { lines, lineWidth };
      },
      { lines: [] as string[][], lineWidth: 0 }
    ).lines;
  }

  /**
   * Detect if the text line is ended with an hard break
   * text and itext do not have wrapping, return false
   * @param {Number} lineIndex text to split
   * @return {Boolean}
   */
  isEndOfWrapping(lineIndex: number): boolean {
    if (!this._styleMap[lineIndex + 1]) {
      // is last line, return true;
      return true;
    }
    if (this._styleMap[lineIndex + 1].line !== this._styleMap[lineIndex].line) {
      // this is last line before a line break, return true;
      return true;
    }
    return false;
  }

  /**
   * Detect if a line has a linebreak and so we need to account for it when moving
   * and counting style.
   * @return Number
   */
  missingNewlineOffset(lineIndex) {
    if (this.splitByGrapheme) {
      return this.isEndOfWrapping(lineIndex) ? 1 : 0;
    }
    return 1;
  }

  /**
   * Gets lines of text to render in the Textbox. This function calculates
   * text wrapping on the fly every time it is called.
   * @param {String} text text to split
   * @returns {Array} Array of lines in the Textbox.
   * @override
   */
  _splitTextIntoLines(text: string) {
    const newText = super._splitTextIntoLines(text),
      graphemeLines = this._wrapText(newText.lines, this.width),
      lines = new Array(graphemeLines.length);
    for (let i = 0; i < graphemeLines.length; i++) {
      lines[i] = graphemeLines[i].join('');
    }
    newText.lines = lines;
    newText.graphemeLines = graphemeLines;
    return newText;
  }

  getMinWidth() {
    return Math.max(this.minWidth, this.dynamicMinWidth);
  }

  _removeExtraneousStyles() {
    const linesToKeep = {};
    for (const prop in this._styleMap) {
      if (this._textLines[prop]) {
        linesToKeep[this._styleMap[prop].line] = 1;
      }
    }
    for (const prop in this.styles) {
      if (!linesToKeep[prop]) {
        delete this.styles[prop];
      }
    }
  }

  /**
   * Returns object representation of an instance
   * @method toObject
   * @param {Array} [propertiesToInclude] Any properties that you might want to additionally include in the output
   * @return {Object} object representation of an instance
   */
  toObject(propertiesToInclude: Array<any>): object {
    return super.toObject(
      ['minWidth', 'splitByGrapheme'].concat(propertiesToInclude)
    );
  }
}

classRegistry.setClass(Textbox);
