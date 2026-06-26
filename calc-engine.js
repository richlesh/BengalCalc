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
    return { expression: this.expression + (this.expectingOperand && this.expression.length > 0 ? "" : this.currentInput) };
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
      this.lastResult = null;
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
      this.lastResult = null;
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
      if (this.expectingOperand && this.lastResult !== null) {
        this.expression = "";
        this.currentInput = "0";
        this.lastResult = null;
      } else if (!this.expectingOperand) {
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

  // Simple recursive descent parser
  _parse(s) {
    this._tokens = this._tokenize(s);
    this._pos = 0;
    const result = this._parseBitwise();
    return result;
  }

  _tokenize(s) {
    const tokens = [];
    let i = 0;
    const funcNames = ["sinh⁻¹", "cosh⁻¹", "tanh⁻¹", "sin⁻¹", "cos⁻¹", "tan⁻¹", "sinh", "cosh", "tanh", "sin", "cos", "tan", "log₂", "log", "ln", "exp", "³√", "√", "10^", "2^"];
    while (i < s.length) {
      if (" \t".includes(s[i])) { i++; continue; }
      // Postfix operators
      if (s[i] === "²" || s[i] === "³" || s[i] === "!") {
        tokens.push(s[i]); i++; continue;
      }
      if (s.startsWith("⁻¹", i)) {
        tokens.push("⁻¹"); i += 2; continue;
      }
      if (s.startsWith("RoL", i)) {
        tokens.push("RoL"); i += 3; continue;
      }
      if (s.startsWith("RoR", i)) {
        tokens.push("RoR"); i += 3; continue;
      }
      if (s.startsWith("ˣ√", i)) {
        tokens.push("ˣ√"); i += 2; continue;
      }
      if (s.startsWith("logBase", i)) {
        tokens.push("logBase"); i += 7; continue;
      }
      // Check for function names
      let matched = false;
      for (const fn of funcNames) {
        if (s.startsWith(fn, i)) {
          tokens.push(fn);
          i += fn.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Standard operators
      if ("+-*/()%^¬∧∨⊕⊽⊼⊙«»".includes(s[i])) {
        if (s[i] === "-" && (tokens.length === 0 || "+-*/(%^¬∧∨⊕⊽⊼⊙«»".includes(tokens[tokens.length - 1]))) {
          let num = "-";
          i++;
          while (i < s.length && (s[i] >= "0" && s[i] <= "9" || s[i] === "." || s[i] === "e" || s[i] === "E")) {
            num += s[i]; i++;
          }
          tokens.push(num);
        } else {
          tokens.push(s[i]); i++;
        }
      } else if (s.startsWith("π", i)) {
        tokens.push(String(Math.PI)); i += 1;
      } else if ((s[i] >= "0" && s[i] <= "9") || s[i] === ".") {
        let num = "";
        while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === "." || s[i] === "e" || s[i] === "E" || (s[i] === "-" && (s[i-1] === "e" || s[i-1] === "E")) || (this.layout === "programmer" && this.base === 16 && "ABCDEFabcdef".includes(s[i])))) {
          num += s[i]; i++;
        }
        tokens.push(num);
      } else if (this.layout === "programmer" && this.base === 16 && "ABCDEFabcdef".includes(s[i])) {
        let num = "";
        while (i < s.length && "0123456789ABCDEFabcdef".includes(s[i])) {
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
    while ("∧∨⊕⊽⊼⊙«»".includes(this._peek()) || this._peek() === "RoL" || this._peek() === "RoR") {
      const op = this._consume();
      const right = this._parseExpr();
      const a = BigInt(Math.trunc(left)), b = BigInt(Math.trunc(right));
      if (op === "∧") left = Number(this._mask64(a & b));
      else if (op === "∨") left = Number(this._mask64(a | b));
      else if (op === "⊕") left = Number(this._mask64(a ^ b));
      else if (op === "⊽") left = Number(this._mask64(~(a | b)));
      else if (op === "⊼") left = Number(this._mask64(~(a & b)));
      else if (op === "⊙") left = Number(this._mask64(~(a ^ b)));
      else if (op === "«") left = Number(this._mask64(a << b));
      else if (op === "»") left = Number(this._mask64(a >> b));
      else if (op === "RoL") { const n = BigInt.asUintN(64, a); const s = b % 64n; left = Number(this._mask64((n << s) | (n >> (64n - s)))); }
      else if (op === "RoR") { const n = BigInt.asUintN(64, a); const s = b % 64n; left = Number(this._mask64((n >> s) | (n << (64n - s)))); }
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
    let base = this._parsePostfix();
    if (this._peek() === "^") {
      this._consume();
      const exp = this._parsePower(); // right-associative
      base = Math.pow(base, exp);
    } else if (this._peek() === "ˣ√") {
      this._consume();
      const root = this._parsePower();
      base = Math.pow(base, 1 / root);
    } else if (this._peek() === "logBase") {
      this._consume();
      const b = this._parsePower();
      base = Math.log(base) / Math.log(b);
    }
    return base;
  }

  _parsePostfix() {
    let val = this._parseUnary();
    while (this._peek() === "²" || this._peek() === "³" || this._peek() === "!" || this._peek() === "⁻¹") {
      const op = this._consume();
      if (op === "²") val = val * val;
      else if (op === "³") val = val * val * val;
      else if (op === "⁻¹") val = 1 / val;
      else if (op === "!") {
        let n = Math.round(val);
        if (n < 0) { val = NaN; continue; }
        if (n > 170) { val = Infinity; continue; }
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        val = r;
      }
    }
    return val;
  }

  _parseUnary() {
    if (this._peek() === "-") {
      this._consume();
      return -this._parsePostfix();
    }
    if (this._peek() === "¬") {
      this._consume();
      const x = this._parsePostfix();
      return Number(this._mask64(~BigInt(Math.trunc(x))));
    }
    if (this._peek() === "+") {
      this._consume();
    }
    return this._parsePrimary();
  }

  _parsePrimary() {
    const funcSet = ["sin⁻¹", "cos⁻¹", "tan⁻¹", "sinh⁻¹", "cosh⁻¹", "tanh⁻¹", "sinh", "cosh", "tanh", "sin", "cos", "tan", "log₂", "log", "ln", "exp", "³√", "√", "10^", "2^"];
    const token = this._peek();
    if (funcSet.includes(token)) {
      this._consume();
      // Expect "(" after function name
      if (this._peek() === "(") {
        this._consume();
        const arg = this._parseBitwise();
        if (this._peek() === ")") this._consume();
        return this._applyFunc(token, arg);
      }
      // No parens — apply to next primary
      return this._applyFunc(token, this._parsePrimary());
    }
    if (token === "(") {
      this._consume();
      const val = this._parseBitwise();
      if (this._peek() === ")") this._consume();
      return val;
    }
    this._consume();
    if (this.layout === "programmer") return parseInt(token, this.base) || 0;
    return parseFloat(token) || 0;
  }

  _applyFunc(name, x) {
    switch (name) {
      case "sin": return Math.sin(this._toRad(x));
      case "cos": return Math.cos(this._toRad(x));
      case "tan": return Math.tan(this._toRad(x));
      case "sin⁻¹": return this._fromRad(Math.asin(x));
      case "cos⁻¹": return this._fromRad(Math.acos(x));
      case "tan⁻¹": return this._fromRad(Math.atan(x));
      case "sinh": return Math.sinh(x);
      case "cosh": return Math.cosh(x);
      case "tanh": return Math.tanh(x);
      case "sinh⁻¹": return Math.asinh(x);
      case "cosh⁻¹": return Math.acosh(x);
      case "tanh⁻¹": return Math.atanh(x);
      case "ln": return Math.log(x);
      case "log": return Math.log10(x);
      case "log₂": return Math.log2(x);
      case "exp": return Math.exp(x);
      case "√": return Math.sqrt(x);
      case "³√": return Math.cbrt(x);
      case "10^": return Math.pow(10, x);
      case "2^": return Math.pow(2, x);
      default: return x;
    }
  }

  // Angle conversion helpers
  _toRad(x) { return this.angleMode === "deg" ? x * Math.PI / 180 : x; }
  _fromRad(x) { return this.angleMode === "deg" ? x * 180 / Math.PI : x; }

  // Scientific operations
  opSquare() { if (this.mode === "rpn") return this._unaryOp(x => x * x); this._algebraicPostfix("²"); }
  opCube() { if (this.mode === "rpn") return this._unaryOp(x => x * x * x); this._algebraicPostfix("³"); }
  opPow() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(y, x));
    this.appendOperator("^");
  }
  opExp() { if (this.mode === "rpn") return this._unaryOp(x => Math.exp(x)); this._algebraicPrefix("exp"); }
  opTenX() { if (this.mode === "rpn") return this._unaryOp(x => Math.pow(10, x)); this._algebraicPrefix("10^"); }
  opTwoX() { if (this.mode === "rpn") return this._unaryOp(x => Math.pow(2, x)); this._algebraicPrefix("2^"); }
  opReciprocal() { if (this.mode === "rpn") return this._unaryOp(x => 1 / x); this._algebraicPostfix("⁻¹"); }
  opSqrt() { if (this.mode === "rpn") return this._unaryOp(x => Math.sqrt(x)); this._algebraicPrefix("√"); }
  opCbrt() { if (this.mode === "rpn") return this._unaryOp(x => Math.cbrt(x)); this._algebraicPrefix("³√"); }
  opXRootY() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(y, 1 / x));
    this.appendOperator("ˣ√");
  }
  opLn() { if (this.mode === "rpn") return this._unaryOp(x => Math.log(x)); this._algebraicPrefix("ln"); }
  opLog10() { if (this.mode === "rpn") return this._unaryOp(x => Math.log10(x)); this._algebraicPrefix("log"); }
  opLog2() { if (this.mode === "rpn") return this._unaryOp(x => Math.log2(x)); this._algebraicPrefix("log₂"); }
  opLogY() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.log(y) / Math.log(x));
    this.appendOperator("logBase");
  }
  opYpowX() {
    if (this.mode === "rpn") return this._binaryOp((y, x) => Math.pow(x, y));
    this.appendOperator("^");
  }
  opFactorial() {
    if (this.mode === "rpn") {
      const factorial = (n) => {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        n = Math.round(n);
        if (n > 170) return Infinity;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
      };
      return this._unaryOp(factorial);
    }
    this._algebraicPostfix("!");
  }
  opSin() { if (this.mode === "rpn") return this._unaryOp(x => Math.sin(this._toRad(x))); this._algebraicPrefix("sin"); }
  opCos() { if (this.mode === "rpn") return this._unaryOp(x => Math.cos(this._toRad(x))); this._algebraicPrefix("cos"); }
  opTan() { if (this.mode === "rpn") return this._unaryOp(x => Math.tan(this._toRad(x))); this._algebraicPrefix("tan"); }
  opAsin() { if (this.mode === "rpn") return this._unaryOp(x => this._fromRad(Math.asin(x))); this._algebraicPrefix("sin⁻¹"); }
  opAcos() { if (this.mode === "rpn") return this._unaryOp(x => this._fromRad(Math.acos(x))); this._algebraicPrefix("cos⁻¹"); }
  opAtan() { if (this.mode === "rpn") return this._unaryOp(x => this._fromRad(Math.atan(x))); this._algebraicPrefix("tan⁻¹"); }
  opSinh() { if (this.mode === "rpn") return this._unaryOp(x => Math.sinh(x)); this._algebraicPrefix("sinh"); }
  opCosh() { if (this.mode === "rpn") return this._unaryOp(x => Math.cosh(x)); this._algebraicPrefix("cosh"); }
  opTanh() { if (this.mode === "rpn") return this._unaryOp(x => Math.tanh(x)); this._algebraicPrefix("tanh"); }
  opAsinh() { if (this.mode === "rpn") return this._unaryOp(x => Math.asinh(x)); this._algebraicPrefix("sinh⁻¹"); }
  opAcosh() { if (this.mode === "rpn") return this._unaryOp(x => Math.acosh(x)); this._algebraicPrefix("cosh⁻¹"); }
  opAtanh() { if (this.mode === "rpn") return this._unaryOp(x => Math.atanh(x)); this._algebraicPrefix("tanh⁻¹"); }

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

  // Algebraic unary helpers — build expression strings instead of computing
  _algebraicPrefix(name) {
    if (this.expectingOperand && this.lastResult !== null) {
      this.currentInput = name + "(" + this._formatNumber(this.lastResult) + ")";
      this.lastResult = null;
    } else if (this.currentInput === "" && this.expression.endsWith(")")) {
      const group = this._extractTrailingGroup();
      this.expression += name + "(" + group + ")";
      return;
    } else {
      this.currentInput = name + "(" + this.currentInput + ")";
    }
    this.expectingOperand = false;
  }

  _algebraicPostfix(symbol) {
    if (this.expectingOperand && this.lastResult !== null) {
      this.currentInput = this._formatNumber(this.lastResult) + symbol;
      this.lastResult = null;
    } else if (this.currentInput === "" && this.expression.endsWith(")")) {
      this.expression += symbol;
      return;
    } else {
      this.currentInput = this.currentInput + symbol;
    }
    this.expectingOperand = false;
  }

  _extractTrailingGroup() {
    let depth = 0;
    let i = this.expression.length - 1;
    while (i >= 0) {
      if (this.expression[i] === ")") depth++;
      else if (this.expression[i] === "(") depth--;
      if (depth === 0) break;
      i--;
    }
    const group = this.expression.slice(i);
    this.expression = this.expression.slice(0, i);
    return group;
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

  opAnd() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) & BigInt(Math.trunc(x)))); this.appendOperator("∧"); }
  opOr() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) | BigInt(Math.trunc(x)))); this.appendOperator("∨"); }
  opXor() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) ^ BigInt(Math.trunc(x)))); this.appendOperator("⊕"); }
  opNor() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(~(BigInt(Math.trunc(y)) | BigInt(Math.trunc(x))))); this.appendOperator("⊽"); }
  opNot() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(~BigInt(Math.trunc(x)))); this._algebraicPrefix("¬"); }
  opNeg() { if (this.mode === "rpn") return this._unaryOp(x => this._mask64(-BigInt(Math.trunc(x)))); this._algebraicPrefix("-"); }
  opShiftLeft() {
    if (this.mode === "rpn") return this._unaryOp(x => this._mask64(BigInt(Math.trunc(x)) << 1n));
    const m = this.currentInput.match(/«(\d+)$/);
    if (m) { this.currentInput = this.currentInput.replace(/«\d+$/, "«" + (parseInt(m[1]) + 1)); }
    else { this._algebraicPostfix("«1"); }
  }
  opShiftRight() {
    if (this.mode === "rpn") return this._unaryOp(x => this._mask64(BigInt(Math.trunc(x)) >> 1n));
    const m = this.currentInput.match(/»(\d+)$/);
    if (m) { this.currentInput = this.currentInput.replace(/»\d+$/, "»" + (parseInt(m[1]) + 1)); }
    else { this._algebraicPostfix("»1"); }
  }
  opShiftLeftBy() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) << BigInt(Math.trunc(x)))); this.appendOperator("«"); }
  opShiftRightBy() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(BigInt(Math.trunc(y)) >> BigInt(Math.trunc(x)))); this.appendOperator("»"); }
  opRoL() {
    if (this.mode === "rpn") return this._unaryOp(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return this._mask64((n << 1n) | (n >> 63n));
    });
    const m = this.currentInput.match(/RoL(\d+)$/);
    if (m) { this.currentInput = this.currentInput.replace(/RoL\d+$/, "RoL" + (parseInt(m[1]) + 1)); }
    else { this._algebraicPostfix("RoL1"); }
  }
  opRoR() {
    if (this.mode === "rpn") return this._unaryOp(x => {
      const n = BigInt.asUintN(64, BigInt(Math.trunc(x)));
      return this._mask64((n >> 1n) | (n << 63n));
    });
    const m = this.currentInput.match(/RoR(\d+)$/);
    if (m) { this.currentInput = this.currentInput.replace(/RoR\d+$/, "RoR" + (parseInt(m[1]) + 1)); }
    else { this._algebraicPostfix("RoR1"); }
  }
  opMod() { if (this.mode === "rpn") return this._binaryOp((y, x) => x === 0 ? 0 : Math.trunc(y) % Math.trunc(x)); this.appendOperator("%"); }
  opNand() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(~(BigInt(Math.trunc(y)) & BigInt(Math.trunc(x))))); this.appendOperator("⊼"); }
  opNxor() { if (this.mode === "rpn") return this._binaryOp((y, x) => this._mask64(~(BigInt(Math.trunc(y)) ^ BigInt(Math.trunc(x))))); this.appendOperator("⊙"); }
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
    let val;
    if (this.mode === "rpn") {
      val = this.expectingOperand ? this.stack[3] : this._parseInput();
    } else {
      val = this._parseInput();
    }
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
