/**
 * @jest-environment jsdom
 */
import { isButtonLike, isRevealControl, isTextField, promoFieldFor, suggestApplyButton } from "./setup-heuristics";

const $ = (selector: string) => document.querySelector(selector)!;

describe("text boxes", () => {
  it.each([
    ["<input>", true],
    ['<input type="text">', true],
    ['<input type="search">', true],
    ['<input type="TEL">', true],
    ["<textarea></textarea>", true],
    ['<input type="checkbox">', false],
    ['<input type="email">', false],
    ['<input type="submit">', false],
    ["<div contenteditable></div>", false],
  ])("%s → %s", (markup, expected) => {
    document.body.innerHTML = markup;
    expect(isTextField(document.body.firstElementChild!)).toBe(expected);
  });

  it("maps a label or a wrapper to the one box it holds", () => {
    document.body.innerHTML = `
      <label for="code">Code</label><div class="wrap"><span>Gift or discount</span><input id="code"></div>
      <div class="two"><input id="a"><input id="b"></div>`;
    expect(promoFieldFor($("label"))).toBe($("#code"));
    expect(promoFieldFor($(".wrap"))).toBe($("#code"));
    expect(promoFieldFor($(".two"))).toBe($(".two"));
  });
});

describe("controls", () => {
  it("knows buttons and reveal links", () => {
    document.body.innerHTML = `
      <button id="b"></button><input id="s" type="submit"><a id="a" href="#">x</a><a id="noref">x</a>
      <div id="r" role="button"></div><summary id="sum">Promo</summary><span id="t" aria-expanded="false">+</span><p id="p"></p>`;
    expect(["#b", "#s", "#a", "#r"].every((s) => isButtonLike($(s)))).toBe(true);
    expect(isButtonLike($("#noref"))).toBe(false);
    expect(["#sum", "#t", "#a"].every((s) => isRevealControl($(s)))).toBe(true);
    expect(isRevealControl($("#p"))).toBe(false);
  });
});

describe("suggesting the apply button", () => {
  it("WooCommerce: the form's own submit button", () => {
    document.body.innerHTML = `
      <form class="checkout_coupon"><input name="coupon_code"><button type="submit" name="apply_coupon">Apply coupon</button></form>`;
    expect(suggestApplyButton($("input"))).toBe($("button"));
  });

  it("prefers the labelled button over others in the same form, skipping reset and remove", () => {
    document.body.innerHTML = `
      <form><input id="code"><button type="reset">Reset</button><button>Remove SAVE10</button><button id="go">Redeem</button><button>Gift wrap</button></form>`;
    expect(suggestApplyButton($("#code"))).toBe($("#go"));
  });

  it("React checkout without a form: the nearby Apply button", () => {
    document.body.innerHTML = `
      <div class="summary"><div class="promo"><div><input id="code"></div><button class="btn">Apply</button></div><button>Pay now</button></div>`;
    expect(suggestApplyButton($("#code"))).toBe($(".btn"));
  });

  it("never suggests the link that opened the box", () => {
    document.body.innerHTML = `
      <form><button type="button" id="reveal">Add promo code</button><input id="code"><button id="apply">Apply</button></form>`;
    expect(suggestApplyButton($("#code"), [$("#reveal")])).toBe($("#apply"));
  });

  it("offers nothing when it would only be guessing", () => {
    document.body.innerHTML = `
      <div><input id="code"><button>Apply</button><button>Apply to all</button></div>`;
    expect(suggestApplyButton($("#code"))).toBeNull();
    document.body.innerHTML = `<div><input id="code"></div><button>Continue to shipping</button>`;
    expect(suggestApplyButton($("#code"))).toBeNull();
  });
});
