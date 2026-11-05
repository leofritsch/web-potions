# Chrome Web Store listing

Everything to paste into the developer dashboard. Keep it true to what the extension does:
the store rejects misleading descriptions, it counts repeating a word more than 5 times as
keyword spam, and it bans anything pitched as getting past paywalls or login restrictions.

## Store listing tab

**Name** (from the manifest): Web Potions

**Summary** (the manifest's `description`, 132 characters at most):

> Make the web how YOU want it to be. Hide what bugs you, restyle any site, or ask your AI to make it so. Free, no tracking.

**Category:** Make Chrome Yours, then Functionality & UI (or the closest match in the dropdown)

**Language:** English

**Homepage URL:** https://github.com/leofritsch/web-potions

**Support URL:** https://github.com/leofritsch/web-potions/issues

**Description** (plain text, the store doesn't render formatting):

```text
Make the web how YOU want it to be.

You look at websites all day, and whatever they show you goes straight into your head. Web Potions lets you decide what gets through.

Every change you make is a potion: a small bundle of tweaks that runs by itself on the sites you choose. One extension instead of a drawer full of half-working ones.

POINT AND CLICK
- Hide anything you pick: pop-ups, banners, sidebars, recommendations
- Restyle any element, or write your own CSS
- Make words glow wherever they appear
- Hide images until you hover them
- Give a page its scrollbar back
- Run your own JavaScript, on a loop or once

ASK YOUR AI TO MAKE IT SO
Use an AI that can drive your Chrome, like Claude in Chrome? Turn on AI mode and tell it what you want in plain words. It tries the change on the page, checks that it works, and saves it.

You stay in charge. AI mode is off until you turn it on. You allow each new site, apart from a short list of popular ones you can switch off. A badge shows while an AI is working, and every save comes with an Undo button.

READY TO GO
Get started with one click: night mode, gray mode, a calmer YouTube, a hype detector for buzzwords, and more.

YOURS TO KEEP
- Everything you save has an on/off switch
- Share your favorites as simple files, or export your whole shelf
- Run any of them once on any page, even if it isn't set to run there

FREE, FOR REAL
Free and open source. No account. No tracking of any kind. What you make stays in your browser.

ONE SETUP STEP
Chrome asks you to switch on "Allow User Scripts" before any extension can run your own scripts. The welcome page shows you where.

Source code: https://github.com/leofritsch/web-potions
```

## Privacy tab

**Single purpose:**

> Lets people change how the websites they choose look and behave, by saving small sets of changes called potions.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `userScripts` | Runs the JavaScript in a user's potions on the sites they choose. This is the extension's core function, and Chrome requires the user to switch on Allow User Scripts first. |
| `scripting` | Shows the extension's interface on the page the user is on: the element picker, the potion editor and AI mode's status cards. |
| `storage` | Saves the user's potions and settings on their own device. |
| `contextMenus` | Adds the Web Potions right-click menu, for picking an element or running a potion. |
| `webNavigation` | During an AI mode session the user has started, re-applies test potions and status cards after each page load in that tab, and ends the session when the tab leaves the site. |
| Host access (`<all_urls>`) | Users decide which sites their potions run on, and that can be any site. The extension only changes a page through a potion the user turned on, or a tool they opened. |

**Are you using remote code?** Yes.

> The extension's own logic is all in the package. Through the User Scripts API, it runs JavaScript in a user's potions: code the user wrote, imported, or had an AI they connected write at their request. The optional catalog of ready-made potions, fetched from GitHub, is plain data, and any JavaScript in it is dropped before it can run.

**Data usage:** check nothing under data collected, then certify the three statements.

> Web Potions has no servers, analytics or accounts. Potions stay in the browser's local storage. Its only network request is the catalog file from GitHub, which carries no user data. AI mode doesn't send anything either: the user's own AI reads pages through its own browser tool.

Double-check this one when you fill it in. It's my reading of the form, and the answers have to match what the extension actually does.

**Privacy policy URL:** https://github.com/leofritsch/web-potions#privacy

## Test instructions for the reviewer

```text
No account or login is needed.

1. Open the Details page for Web Potions in chrome://extensions and switch on Allow User Scripts. The welcome page links to it.
2. On any site, click the toolbar icon, then Create new potion. Use Pick & zap to hide something, then Save potion. Reload the page: the change is still there. Use the switch in the toolbar popup to turn it off.
3. Browse in the popup shows the catalog of ready-made potions.

AI mode is optional and off by default. It lets a browser agent the user already runs, such as Claude in Chrome, test and save potions.
- Turn it on under Settings.
- A real Ctrl+Alt+Shift+P key press unlocks one tab for one site, which page scripts can't fake. Until then, page messages get no answer.
- The first time on a site that isn't on the popular list, a separate window asks the user to allow it.
- An AI can only save potions for the site it's on. It can't delete anything, or change potions that also run elsewhere.
- Every save shows a card with an Undo button, and an "Operated by AI" badge shows while a session is active.
```

## Images still needed

- Store icon, 128x128: `extension/icons/icon128.png`
- At least 1 screenshot, up to 5, each 1280x800
- Optional small promo tile, 440x280
- Optional marquee promo tile, 1400x560
