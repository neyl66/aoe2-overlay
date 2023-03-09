// ==UserScript==
// @name         Aoe2recs get k
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Show k code.
// @author       Neyl
// @match        https://aoe2recs.com/dashboard/overlay/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aoe2recs.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    alert(localStorage?.k ? encodeUriComponent(localStorage.k) : "");
})();