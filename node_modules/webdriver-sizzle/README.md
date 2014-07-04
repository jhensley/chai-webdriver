Locate a [selenium-webdriver](https://npmjs.org/package/selenium-webdriver) element by sizzle CSS selector.

Most operations return a `Q` promise.

```js
var selenium = require('selenium-webdriver');
var sizzle = require('webdriver-sizzle');
var driver = new webdriver.Builder().withCapabilities(webdriver.Capabilities.phantomjs()).build()
var $ = sizzle(driver);

// Find the first element with class btn and click it
$('.btn').then(function(el) {
  //el is a selenium WebElement
  el.click()
});

// Count the paragraphs
$.all('p').then(function (elements) {
  console.log(elements.count);
});

```
