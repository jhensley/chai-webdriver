var fs = require('fs');
var seleniumWebdriver = require('selenium-webdriver');
var sizzle = require('webdriver-sizzle-promised');
var Q = require('q');

module.exports = function(driver, timeout, interval) {
  var $ = sizzle(driver);

  timeout = timeout || 1000;
  interval = interval || Math.min(200, Math.max(0, timeout - 100));

  return function(chai, utils) {
    //convert the weird  selenium promise to a Q promise
    function promise(selPromise) {
      var defer = Q.defer();

      selPromise.then(function() {
        defer.resolve.apply(defer, arguments);
      });
      selPromise.thenCatch(function() {
        defer.reject.apply(defer, arguments);
      });

      return defer.promise;
    };

    function assertElementExists(selector) {
      return $(selector).fail(function(err) {
        throw new Error('element does not exist');
      });
    };

    //if we have `eventually` flag, retry until result of `fn` is resolved promise, or `timeout` expires
    function retry(eventually, fn) {
      var retry = eventually;
      var defer = Q.defer();

      if (retry) {
        setTimeout(function() {
          retry = false;
        }, timeout);
      }

      var assert = function() {
        var result;

        try {
          result = Q(fn());
        }
        catch (err) {
          result = Q.reject(err);
        }

        result.then(function() {
          defer.resolve.apply(defer, arguments);
        });
        result.fail(function() {
          if (retry) {
            setTimeout(assert, interval);
          }
          else {
            defer.reject.apply(defer, arguments);
          }
        });
      };

      assert();

      return defer.promise;
    };

    chai.Assertion.addProperty('dom', function() {
      utils.flag(this, 'dom', true);
    });
    chai.Assertion.addProperty('eventually', function() {
      utils.flag(this, 'eventually', true);
    });
    chai.Assertion.addProperty('larger', function() {
      utils.flag(this, 'parseNumber', true);
      utils.flag(this, 'larger', true);
    });
    chai.Assertion.addProperty('smaller', function() {
      utils.flag(this, 'parseNumber', true);
      utils.flag(this, 'smaller', true);
    });
    chai.Assertion.overwriteMethod('match', function(_super) {
      return function(matcher) {
        var self = this;

        if (utils.flag(this, 'dom')) {
          return retry(utils.flag(this, 'eventually'), function() {
            return assertElementExists(self._obj).then(function(el) {
              return el.getText().then(function(text) {
                self.assert(matcher.test(text), 'Expected element <#{this}> to match regular expression "#{exp}", but it contains "#{act}".', 'Expected element <#{this}> not to match regular expression "#{exp}"; it contains "#{act}".', matcher, text);
              });
            });
          });
        }
        else {
          return _super.call(this, matcher);
        }
      };
    });
    chai.Assertion.addMethod('displayed', function() {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test display of dom elements');
      }

      var assert = function(condition) {
        self.assert(condition, 'Expected #{this} to be displayed but it is not', 'Expected #{this} to not be displayed but it is');
      };

      return retry(utils.flag(self, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.isDisplayed().then(function(displayed) {
            return assert(displayed);
          });
        }, function(err) {
          if (utils.flag(self, 'negate')) {
            return assert(false);
          }
          throw err;
        });
      });
    });
    chai.Assertion.addMethod('visible', function() {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test visibility of dom elements');
      }

      var assert = function(condition) {
        self.assert(condition, 'Expected #{this} to be visible but it is not', 'Expected #{this} to not be visible but it is');
      };

      return retry(utils.flag(self, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          var window = driver.manage().window();

          return Q.all([el.isDisplayed(), el.getSize(), el.getLocation(), promise(window.getSize())]).spread(function(displayed, size, loc, winSize) {
            //selenium may say it's displayed even though it's off-screen
            return assert(displayed && loc.x > -size.width && loc.y > -size.height && loc.y < winSize.height && loc.x < winSize.width);
          });
        }, function(err) {
          if (utils.flag(self, 'negate')) {
            return assert(false);
          }
          throw err;
        });
      });
    });
    chai.Assertion.addMethod('count', function(length) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test count of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return $.all(self._obj).then(function(els) {
          if (utils.flag(self, 'larger')) {
            self.assert(els.length >= length, 'Expected #{this} to appear more than #{exp} times, but it appeared #{act} times.', 'Expected #{this} not to appear more than #{exp} times, but it appeared #{act} times.', length, els.length);
          }
          else if (utils.flag(self, 'smaller')) {
            self.assert(els.length <= length, 'Expected #{this} to appear less than #{exp} times, but it appeared #{act} times.', 'Expected #{this} not to appear less than #{exp} times, but it appeared #{act} times.', length, els.length);
          }
          else {
            self.assert(els.length === length, 'Expected #{this} to appear #{exp} times, but it appeared #{act} times.', 'Expected #{this} not to appear #{exp} times, but it did.', length, els.length);
          }
        });
      });
    });
    chai.Assertion.addMethod('text', function(matcher) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test text of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.getText().then(function(text) {
            if (matcher instanceof RegExp) {
              self.assert(matcher.test(text), 'Expected element <#{this}> to match regular expression "#{exp}", but it contains "#{act}".', 'Expected element <#{this}> not to match regular expression "#{exp}"; it contains "#{act}".', matcher, text);
            }
            else if (utils.flag(self, 'contains')) {
              self.assert(~text.indexOf(matcher), 'Expected element <#{this}> to contain text "#{exp}", but it contains "#{act}" instead.', 'Expected element <#{this}> not to contain text "#{exp}", but it contains "#{act}".', matcher, text);
            }
            else if (utils.flag(self, 'parseNumber')) {
              text = text.length;

              if (utils.flag(self, 'larger')) {
                self.assert(text >= matcher, 'Expected length of text of element <#{this}> to be larger than #{exp}, but it was #{act}.', 'Expected length of text of element <#{this}> to not be larger than #{exp}, but it was #{act}.', matcher, text);
              }
              else if (utils.flag(self, 'smaller')) {
                self.assert(text <= matcher, 'Expected length of text of element <#{this}> to be smaller than #{exp}, but it was #{act}.', 'Expected length of text of element <#{this}> to not be smaller than #{exp}, but it was #{act}.', matcher, text);
              }
            }
            else {
              self.assert(text === matcher, 'Expected text of element <#{this}> to be "#{exp}", but it was "#{act}" instead.', 'Expected text of element <#{this}> not to be "#{exp}", but it was.', matcher, text);
            }
          });
        });
      });
    });
    chai.Assertion.addMethod('style', function(property, value) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test style of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.getCssValue(property).then(function(style) {
            if (utils.flag(self, 'parseNumber')) {
              style = parseFloat(style);

              if (utils.flag(self, 'larger')) {
                self.assert(style >= value, 'Expected style ' + property + ' of element <#{this}> to be larger than #{exp}, but it was #{act}.', 'Expected style ' + property + ' of element <#{this}> not to be larger than #{exp}, but it was #{act}.', value, style);
              }
              else if (utils.flag(self, 'smaller')) {
                self.assert(style <= value, 'Expected style ' + property + ' of element <#{this}> to be smaller than #{exp}, but it was #{act}.', 'Expected style ' + property + ' of element <#{this}> not to be smaller than #{exp}, but it was #{act}.', value, style);
              }
            }
            else {
              self.assert(style === value.toString(), 'Expected style ' + property + ' of element <#{this}> to be #{exp}, but it was #{act}.', 'Expected ' + property + ' of element <#{this}> to not be #{exp}, but it was.');
            }
          });
        });
      });
    });
    chai.Assertion.addMethod('value', function(value) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.getAttribute('value').then(function(actualValue) {
            if (utils.flag(self, 'parseNumber')) {
              actualValue = parseFloat(actualValue);

              if (utils.flag(self, 'larger')) {
                self.assert(actualValue >= value, 'Expected value of element <#{this}> to be larger than #{exp}, but it was #{act}.', 'Expected value of element <#{this}> not to be larger than #{exp}, but it was #{act}.', value, actualValue);
              }
              else if (utils.flag(self, 'smaller')) {
                self.assert(actualValue <= value, 'Expected value of element <#{this}> to be smaller than #{exp}, but it was #{act}.', 'Expected value of element <#{this}> not to be smaller than #{exp}, but it was #{act}.', value, actualValue);
              }
            }
            else {
              self.assert(value === actualValue, 'Expected value of element <#{this}> to be #{exp}, but it was #{act}.', 'Expected value of element <#{this}> to not be #{exp}, but it was.', value, actualValue);
            }
          });
        });
      });
    });
    chai.Assertion.addMethod('disabled', function() {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.getAttribute('disabled').then(function(disabled) {
            self.assert(disabled, 'Expected #{this} to be disabled but it is not', 'Expected #{this} to not be disabled but it is');
          });
        });
      });
    });
    chai.Assertion.addMethod('htmlClass', function(value) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj).then(function(el) {
          return el.getAttribute('class').then(function(classList) {
            self.assert(~classList.indexOf(value), "Expected " + classList + " to contain " + value + ", but it does not.");
          });
        });
      });
    });
    return chai.Assertion.addMethod('attribute', function(attribute, value) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test style of dom elements');
      }

      return retry(utils.flag(this, 'eventually'), function() {
        return assertElementExists(self._obj, utils.flag(this, 'eventually')).then(function(el) {
          return el.getAttribute(attribute).then(function(actual) {
             if (utils.flag(self, 'parseNumber')) {
              actual = parseFloat(actual);

              if (utils.flag(self, 'larger')) {
                self.assert(actual >= value, 'Expected attribute ' + attribute + ' of element <#{this}> to be larger than #{exp}, but it was #{act}.', 'Expected attribute ' + attribute + ' of element <#{this}> not to be larger than #{exp}, but it was #{act}.', value, actual);
              }
              else if (utils.flag(self, 'smaller')) {
                self.assert(actual <= value, 'Expected attribute ' + attribute + ' of element <#{this}> to be smaller than #{exp}, but it was #{act}.', 'Expected attribute ' + attribute + ' of element <#{this}> not to be smaller than #{exp}, but it was #{act}.', value, actual);
              }
            }
            else {
              if (typeof value === 'undefined') {
                self.assert(typeof actual === 'string', 'Expected attribute ' + attribute + ' of element <#{this}> to exist.', 'Expected attribute ' + attribute + ' of element <#{this}> not to exist.', value, actual);
              }
              else {
                self.assert(actual === value, 'Expected attribute ' + attribute + ' of element <#{this}> to be #{exp}, but it was #{act}.', 'Expected attribute ' + attribute + ' of element <#{this}> not to be #{act}, but it was.', value, actual);
              }
            }
          });
        });
      });
    });
  };
};
