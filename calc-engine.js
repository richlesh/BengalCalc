class CalcEngine {
  constructor() {
    this.mode = "algebraic";
    this.layout = "scientific";
    this.angleMode = "rad";
    this.secondActive = false;
    this.base = 10;
    this.memory = 0;
    this.precision = -1;
    this.displayFormat = "auto";
    this.reset();
  }

  reset() {
    // RPN stack: [t, z, y, x] — index 3 is x (bottom/visible)
    this.stack = [0, 0, 0, 0];
    // Algebraic state
    this.expression = "";
    this.currentInput = "0";
    this.lastResult = null;
    this.expectingOperand = true;
    this.stackLift = false;
    this.clearPending = false;
    this.parenDepth = 0;
  }

  clear() {
    if (this.mode === "rpn") {
      if (this.clearPending) {
        this.stack = [0, 0, 0, 0];
        this.clearPending = false;
      }
      this.currentInput = "0";
      this.stack[3] = 0;
      this.expectingOperand = true;
      this.stackLift = false;
    } else {
      this.reset();
    }
  }

  clearEntry() {
    this.currentInput = "0";
    this.expectingOperand = true;
  }

  getDisplay() {
    if (this.mode === "rpn") {
      return {
        stack: [...this.stack],
        x: this.expectingOperand ? this.stack[3] : this._parseInput(),
      };
    }
    return { expression: this.expression + this.currentInput };
  }

  _parseInput() {
    if (this.layout === "programmer") {
      return parseInt(this.currentInput, this.base) || 0;
    }
    return parseFloat(this.currentInput) || 0;
  }

  _formatNumber(n) {
    if (this.layout === "programmer") {
      n = Math.trunc(n);
      if (this.base === 16) return n.toString(16).toUpperCase();
      if (this.base === 8) return n.toString(8);
      return n.toString(10);
    }
    const p = this.precision >= 0 ? this.precision : 9;
    switch (this.displayFormat) {
      case "fixed":
        return n.toFixed(p);
      case "scientific":
        return n.toExponential(p);
      case "engineering": {
        if (n === 0) return (0).toFixed(p) + "e+0";
        const exp3 = Math.floor(Math.log10(Math.abs(n)) / 3) * 3;
        const mantissa = n / Math.pow(10, exp3);
        return mantissa.toFixed(p) + "e" + (exp3 >= 0 ? "+" : "") + exp3;
      }
      default: // "auto"
        if (this.precision >= 0) return n.toFixed(this.precision);
        if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
        return parseFloat(n.toPrecision(p)).toString();
    }
  }

  inputDigit(d) {
    if (this.expectingOperand) {
      if (this.mode === "rpn" && this.stackLift) {
        this.pushStack(this.stack[3]);
      }
      this.currentInput = d === "." ? "0." : d;
      this.expectingOperand = false;
      this.stackLift = false;
    } else {
      if (d === "." && this.currentInput.includes(".")) return;
      if (d === "00") {
        this.currentInput += "00";
      } else {
        if (this.currentInput === "0" && d !== ".") {
          this.currentInput = d;
        } else {
          this.currentInput += d;
        }
      }
    }
  }

  inputHexDigit(d) {
    if (this.base < 16) return;
    if (this.expectingOperand) {
      if (this.mode === "rpn" && this.stackLift) {
        this.pushStack(this.stack[3]);
      }
      this.currentInput = d;
      this.expectingOperand = false;
      this.stackLift = false;
    } else {
      if (this.currentInput === "0") {
        this.currentInput = d;
      } else {
        this.currentInput += d;
      }
    }
  }

  backspace() {
    if (this.expectingOperand) return;
    this.currentInput = this.currentInput.slice(0, -1);
    if (!this.currentInput || this.currentInput === "-") {
      this.currentInput = "0";
      this.expectingOperand = true;
    }
  }

  toggleSign() {
    if (this.mode === "rpn" && this.expectingOperand) {
      this.stack[3] = -this.stack[3];
    } else {
      if (this.currentInput.startsWith("-")) {
        this.currentInput = this.currentInput.slice(1);
      } else if (this.currentInput !== "0") {
        this.currentInput = "-" + this.currentInput;
      }
    }
  }

  // RPN stack operations
  _commitInput() {
    if (!this.expectingOperand) {
      this.stack[3] = this._parseInput();
    }
  }

  pushStack(val) {
    this.stack.shift();
    this.stack.push(val);
  }

  enter() {
    if (this.mode === "rpn") {
      const x = this.expectingOperand ? this.stack[3] : this._parseInput();
      if (!this.expectingOperand) {
        // Commit typed value to X, then lift to duplicate
        this.stack[3] = x;
      }
      this.pushStack(x);
      this.expectingOperand = true;
      this.stackLift = false;
    }
  }

  drop() {
    this._commitInput();
    this.stack.splice(3, 1);
    this.stack.unshift(0);
    this.expectingOperand = true;
    this.stackLift = true;
  }

  swapXY() {
    this._commitInput();
    const tmp = this.stack[3];
    this.stack[3] = this.stack[2];
    this.stack[2] = tmp;
    this.expectingOperand = true;
    this.stackLift = true;
  }

  rollDown() {
    this._commitInput();
    const x = this.stack[3];
    this.stack.splice(3, 1);
    this.stack.unshift(x);
    this.expectingOperand = true;
    this.stackLift = true;
  }

  rollUp() {
    this._commitInput();
    const t = this.stack[0];
    this.stack.splice(0, 1);
    this.stack.push(t);
    this.expectingOperand = true;
    this.stackLift = true;
  }

  // Get x value for operations
  _getX() {
    if (this.expectingOperand) return this.stack[3];
    const val = this._parseInput();
    this.pushStack(val);
    this.expectingOperand = true;
    return val;
  }

  // Binary operator for RPN
  _binaryOp(fn) {
    if (this.mode === "rpn") {
      let x;
      if (this.expectingOperand) {
        x = this.stack[3];
      } else {
        x = this._parseInput();
        this.expectingOperand = true;
      }
      const y = this.stack[2];
      const result = fn(y, x);
      // Drop stack: T replicates, Z→Y, result→X
      this.stack[3] = result;
      this.stack[2] = this.stack[1];
      this.stack[1] = this.stack[0];
      this.stackLift = true;
      return result;
    }
  }

  // Unary operator for RPN
  _unaryOp(fn) {
    if (this.mode === "rpn") {
      let x;
      if (this.expectingOperand) {
        x = this.stack[3];
      } else {
        x = this._parseInput();
        this.expectingOperand = true;
      }
      const result = fn(x);
      this.stack[3] = result;
      this.stackLift = true;
      return result;
    }
  }

  // Algebraic mode: append to expression
  appendOperator(op) {
    if (this.mode === "algebraic") {
      if (this.expectingOperand && this.lastResult !== null) {
        this.expression = this._formatNumber(this.lastResult) + op;
        this.lastResult = null;
      } else {
        this.expression += this.currentInput + op;
      }
      this.currentInput = "0";
      this.expectingOperand = true;
    }
  }

  openParen() {
    if (this.mode === "algebraic") {
      if (!this.expectingOperand) {
        this.expression += this.currentInput + "×";
        this.currentInput = "0";
      }
      this.expression += "(";
      this.parenDepth++;
      this.expectingOperand = true;
    }
  }

  closeParen() {
    if (this.mode === "algebraic" && this.parenDepth > 0) {
      this.expression += this.currentInput + ")";
      this.currentInput = "";
      this.parenDepth--;
      this.expectingOperand = true;
    }
  }

  evaluate() {
    if (this.mode === "algebraic") {
      let expr = this.expression + this.currentInput;
      // Close any open parens
      while (this.parenDepth > 0) {
        expr += ")";
        this.parenDepth--;
      }
      try {
        const result = this._evalExpression(expr);
        this.lastResult = result;
        this.expression = "";
        this.currentInput = this._formatNumber(result);
        this.expectingOperand = true;
        return result;
      } catch {
        this.lastResult = null;
        this.expression = "";
        this.currentInput = "Error";
        this.expectingOperand = true;
        return NaN;
      }
    }
  }

  _evalExpression(expr) {
    // Replace display operators with JS operators
    let s = expr.replace(/×/g, "*").replace(/÷/g, "/");
    // Evaluate using safe parser
    return this._parse(s);
  }

  // Simple recursive descent parser for +, -, *, /, ^ with proper precedence
  _parse(s) {
    this._tokens = this._tokenize(s);
    this._pos = 0;
    const result = this._parseBitwise();
    return result;
  }

  _tokenize(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      if (" \t".includes(s[i])) { i++; continue; }
      if ("+-*/()%^&|⊕⊽«»".includes(s[i])) {
        // Handle negative numbers: minus at start or after operator/open paren
        if (s[i] === "-" && (tokens.length === 0 || "+-*/(%^&|⊕⊽«»".includes(tokens[tokens.length - 1]))) {
          let num = "-";
          i++;
          while (i < s.length && (s[i] >= "0" && s[i] <= "9" || s[i] === "." || s[i] === "e" || s[i] === "E")) {
            num += s[i]; i++;
          }
          tokens.push(num);
        } else {
          tokens.push(s[i]); i++;
        }
      } else if ((s[i] >= "0" && s[i] <= "9") || s[i] === "." || (this.layout === "programmer" && this.base === 16 && "ABCDEFabcdef".includes(s[i]))) {
        let num = "";
        while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === "." || s[i] === "e" || s[i] === "E" || (s[i] === "-" && (s[i-1] === "e" || s[i-1] === "E")) || (this.layout === "programmer" && this.base === 16 && "ABCDEFabcdef".includes(s[i])))) {
          num += s[i]; i++;
        }
        tokens.push(num);
      } else {
        i++; // skip unknown
      }
    }
    return tokens;
  }

  _peek() { return this._tokens[this._pos] || null; }
  _consume() { return this._tokens[this._pos++]; }

  _parseBitwise() {
    let left = this._parseExpr();
    while ("&|⊕⊽«»".includes(this._peek())) {
      const op = this._consume();
      const right = this._parseExpr();
      const a = BigInt(Math.trunc(left)), b = BigInt(Math.trunc(right));
      if (op === "&") left = Number(this._mask64(a & b));
      else if (op === "|") left = Number(this._mask64(a | b));
      else if (op === "⊕") left = Number(this._mask64(a ^ b));
      else if (op === "⊽") left = Number(this._mask64(~(a | b)));
      else if (op === "«") left = Number(this._mask64(a << b));
      else if (op === "»") left = Number(this._mask64(a >> b));
    }
    return left;
  }

  _parseExpr() {
    let left = this._parseTerm();
    while (this._peek() === "+" || this._peek() === "-") {
      const op = this._consume();
      const right = this._parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  _parseTerm() {
    let left = this._parsePower();
    while (this._peek() === "*" || this._peek() === "/" || this._peek() === "%") {
      const op = this._consume();
      const right = this._parsePower();
      if (op === "*") left *= right;
      else if (op === "/") left /= right;
      else left %= right;
    }
    return left;
  }

  _parsePower() {
    let base = this._parseUnary();
    if (this._peek() === "^") {
      this._consume();
      const exp = this._parsePower(); // right-associative
      base = Math.pow(base, exp);
    }
    return base;
  }

  _parseUnary() {
    if (this._peek() === "-") {
      this._consume();
      return -this._parsePrimary();
    }
    if (this._peek() === "+") {
      this._consume();
    }
    return this._parsePrimary();
  }

  _parsePrimary() {
    if (this._peek() === "(") {
      this._consume();
      const val = this._parseBitwise();
      if (this._peek() === ")") this._consume();
      return val;
    }
    const token = this._consume();
    if (this.layout === "programmer") return parseInt(token, this.base) || 0;
    return parseFloat(token) || 0;
  }

  // Angle conversion helpers
  _toRad(x) { return this.angleMode === "deg" ? x * Math.PI / 180 : x; }
  _fromRad(x) { return this.angleMode === "deg" ? x * 180 / Math.PI : x; }

  // Scientific operations
  opSquare() { return this.mode === "rpn" ? this._unaryOp(x => x * x) : this._algebraicUnary(x => x * x); }
  opCube() { return this.mode === "rpn" ? this._unaryOp(x => x * x * x) : this._algebraicUnary(x => x * x * x); }
  opPow() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(y, x));
    this.appendOperator("^");
  }
  opExp() { return this.mode === "rpn" ? this._unaryOp(x => Math.exp(x)) : this._algebraicUnary(x => Math.exp(x)); }
  opTenX() { return this.mode === "rpn" ? this._unaryOp(x => Math.pow(10, x)) : this._algebraicUnary(x => Math.pow(10, x)); }
  opTwoX() { return this.mode === "rpn" ? this._unaryOp(x => Math.pow(2, x)) : this._algebraicUnary(x => Math.pow(2, x)); }
  opReciprocal() { return this.mode === "rpn" ? this._unaryOp(x => 1 / x) : this._algebraicUnary(x => 1 / x); }
  opSqrt() { return this.mode === "rpn" ? this._unaryOp(x => Math.sqrt(x)) : this._algebraicUnary(x => Math.sqrt(x)); }
  opCbrt() { return this.mode === "rpn" ? this._unaryOp(x => Math.cbrt(x)) : this._algebraicUnary(x => Math.cbrt(x)); }
  opXRootY() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(y, 1 / x));
    this.appendOperator("^(1/");
  }
  opLn() { return this.mode === "rpn" ? this._unaryOp(x => Math.log(x)) : this._algebraicUnary(x => Math.log(x)); }
  opLog10() { return this.mode === "rpn" ? this._unaryOp(x => Math.log10(x)) : this._algebraicUnary(x => Math.log10(x)); }
  opLog2() { return this.mode === "rpn" ? this._unaryOp(x => Math.log2(x)) : this._algebraicUnary(x => Math.log2(x)); }
  opLogY() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.log(y) / Math.log(x));
    // In algebraic, treat as unary with current input as base — simplified
    this.appendOperator("logBase");
  }
  opYpowX() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(x, y));
    this.appendOperator("^");
  }
  opFactorial() {
    const factorial = (n) => {
      if (n < 0) return NaN;
      if (n === 0 || n === 1) return 1;
      n = Math.round(n);
      if (n > 170) return Infinity;
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    };
    return this.mode === "rpn" ? this._unaryOp(factorial) : this._algebraicUnary(factorial);
  }
  opSin() { return this.mode === "rpn" ? this._unaryOp(x => Math.sin(this._toRad(x))) : this._algebraicUnary(x => Math.sin(this._toRad(x))); }
  opCos() { return this.mode === "rpn" ? this._unaryOp(x => Math.cos(this._toRad(x))) : this._algebraicUnary(x => Math.cos(this._toRad(x))); }
  opTan() { return this.mode === "rpn" ? this._unaryOp(x => Math.tan(this._toRad(x))) : this._algebraicUnary(x => Math.tan(this._toRad(x))); }
  opAsin() { return this.mode === "rpn" ? this._unaryOp(x => this._fromRad(Math.asin(x))) : this._algebraicUnary(x => this._fromRad(Math.asin(x))); }
  opAcos() { return this.mode === "rpn" ? this._unaryOp(x => this._fromRad(Math.acos(x))) : this._algebraicUnary(x => this._fromRad(Math.acos(x))); }
  opAtan() { return this.mode === "rpn" ? this._unaryOp(x => this._fromRad(Math.atan(x))) : this._algebraicUnary(x => this._fromRad(Math.atan(x))); }
  opSinh() { return this.mode === "rpn" ? this._unaryOp(x => Math.sinh(x)) : this._algebraicUnary(x => Math.sinh(x)); }
  opCosh() { return this.mode === "rpn" ? this._unaryOp(x => Math.cosh(x)) : this._algebraicUnary(x => Math.cosh(x)); }
  opTanh() { return this.mode === "rpn" ? this._unaryOp(x => Math.tanh(x)) : this._algebraicUnary(x => Math.tanh(x)); }
  opAsinh() { return this.mode === "rpn" ? this._unaryOp(x => Math.asinh(x)) : this._algebraicUnary(x => Math.asinh(x)); }
  opAcosh() { return this.mode === "rpn" ? this._unaryOp(x => Math.acosh(x)) : this._algebraicUnary(x => Math.acosh(x)); }
  opAtanh() { return this.mode === "rpn" ? this._unaryOp(x => Math.atanh(x)) : this._algebraicUnary(x => Math.atanh(x)); }

  opPercent() {
    if (this.mode === "rpn") {
      this._unaryOp(x => x / 100);
    } else {
      const val = this._parseInput() / 100;
      this.currentInput = this._formatNumber(val);
    }
  }

  opEE() {
    if (!this.expectingOperand) {
      this.currentInput += "e";
    }
  }

  opPi() {
    if (this.mode === "rpn") {
      if (!this.expectingOperand) {
        this.pushStack(this._parseInput());
      }
      this.pushStack(Math.PI);
      this.expectingOperand = true;
    } else {
      this.currentInput = Math.PI.toString();
      this.expectingOperand = false;
    }
  }

  opE() {
    if (this.mode === "rpn") {
      if (!this.expectingOperand) {
        this.pushStack(this._parseInput());
      }
      this.pushStack(Math.E);
      this.expectingOperand = true;
    } else {
      this.currentInput = Math.E.toString();
      this.expectingOperand = false;
    }
  }

  opRand() {
    const r = Math.random();
    if (this.mode === "rpn") {
      if (!this.expectingOperand) {
        this.pushStack(this._parseInput());
      }
      this.pushStack(r);
      this.expectingOperand = true;
    } else {
      this.currentInput = r.toString();
      this.expectingOperand = false;
    }
  }

  // Memory operations
  opMC() { this.memory = 0; }
  opMPlus() { this.memory += this.mode === "rpn" ? this.stack[3] : this._parseInput(); }
  opMMinus() { this.memory -= this.mode === "rpn" ? this.stack[3] : this._parseInput(); }
  opMR() {
    if (this.mode === "rpn") {
      if (!this.expectingOperand) this.pushStack(this._parseInput());
      this.pushStack(this.memory);
      this.expectingOperand = true;
    } else {
      this.currentInput = this._formatNumber(this.memory);
      this.expectingOperand = false;
    }
  }

  // Algebraic unary helper — applies function to current value
  _algebraicUnary(fn) {
    const val = this._parseInput();
    const result = fn(val);
    this.currentInput = this._formatNumber(result);
    this.expectingOperand = false;
    return result;
  }

  // Arithmetic for RPN
  opAdd() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => y + x);
    this.appendOperator("+");
  }
  opSubtract() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => y - x);
    this.appendOperator("-");
  }
  opMultiply() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => y * x);
    this.appendOperator("×");
  }
  opDivide() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => y / x);
    this.appendOperator("÷");
  }

  // Programmer operations (all work on integers using BigInt for 64-bit)
  _intVal() {
    const x = this._getX();
    return BigInt(Math.trunc(x));
  }

  _mask64(n) {
    return Number(BigInt.asIntN(64, n));
  }

  opAnd() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) & BigInt(Math.trunc(x)))); this.appendOperator("&"); }
  opOr() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) | BigInt(Math.trunc(x)))); this.appendOperator("|"); }
  opXor() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) ^ BigInt(Math.trunc(x)))); this.appendOperator("⊕"); }
  opNor() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(~(BigInt(Math.trunc(y)) | BigInt(Math.trunc(x))))); this.appendOperator("⊽"); }
  opNot() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(~BigInt(Math.trunc(x)))); return this._algebraicUnary(x => Number(this._mask64(~BigInt(Math.trunc(x))))); }
  opNeg() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(-BigInt(Math.trunc(x)))); return this._algebraicUnary(x => Number(this._mask64(-BigInt(Math.trunc(x))))); }
  opShiftLeft() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(BigInt(Math.trunc(x)) << 1n)); return this._algebraicUnary(x => Number(this._mask64(BigInt(Math.trunc(x)) << 1n))); }
  opShiftRight() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(BigInt(Math.trunc(x)) >> 1n)); return this._algebraicUnary(x => Number(this._mask64(BigInt(Math.trunc(x)) >> 1n))); }
  opShiftLeftBy() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) << BigInt(Math.trunc(x)))); this.appendOperator("«"); }
  opShiftRightBy() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) >> BigInt(Math.trunc(x)))); this.appendOperator("»"); }
  opRoL() {
    if (this.mode === "rpn") return this._unaryOp(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return this._mask64((n << 1n) | (n >> 63n));
    });
    return this._algebraicUnary(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return Number(this._mask64((n << 1n) | (n >> 63n)));
    });
  }
  opRoR() {
    if (this.mode === "rpn") return this._unaryOp(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return this._mask64((n >> 1n) | (n << 63n));
    });
    return this._algebraicUnary(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return Number(this._mask64((n >> 1n) | (n << 63n)));
    });
  }
  opMod() { if (this.mode === "rpn") return this._binaryOp((y, x) => x === 0 ? 0 : Math.trunc(y) % Math.trunc(x)); this.appendOperator("%"); }
  opFlip8() {
    return this._unaryOp(x => {
      let n = Math.trunc(x) & 0xFF;
      let r = 0;
      for (let i = 0; i < 8; i++) { r = (r << 1) | (n & 1); n >>= 1; }
      return r;
    });
  }
  opFlip16() {
    return this._unaryOp(x => {
      let n = Math.trunc(x) & 0xFFFF;
      let r = 0;
      for (let i = 0; i < 16; i++) { r = (r << 1) | (n & 1); n >>= 1; }
      return r;
    });
  }
  opFF() {
    if (this.base < 16) return;
    if (this.expectingOperand) {
      this.currentInput = "FF";
      this.expectingOperand = false;
    } else {
      this.currentInput += "FF";
    }
  }

  toggleAngleMode() {
    this.angleMode = this.angleMode === "rad" ? "deg" : "rad";
  }

  formatDisplay(val) {
    if (val === undefined || val === null) return "0";
    if (typeof val === "string") return val;
    return this._formatNumber(val);
  }

  getBinaryDisplay() {
    const val = this.stack[3];
    const n = BigInt.asUintN(64, BigInt(Math.trunc(val || 0)));
    const bits = n.toString(2).padStart(64, "0");
    const nibbles = [];
    for (let i = 0; i < 64; i += 4) {
      nibbles.push(bits.slice(i, i + 4));
    }
    return nibbles;
  }
}

module.exports = { CalcEngine };
