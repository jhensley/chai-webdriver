var fs = require('fs');
var string = require('string');
var seleniumWebdriver = require('selenium-webdriver');
var sizzle = require('webdriver-sizzle');
var Q = require('q');

module.exports = chaiWebdriver = function(driver, timeout) {
  var $ = sizzle(driver);

  timeout = timeout || 9000;

  return function(chai, utils) {
    var selectAll = function(selector, eventually) {
      var defer = Q.defer();
      var retry = eventually;

      if (retry) {
        setTimeout(function() {
          retry = false;
        }, timeout);
      }

      var sel = function() {
        var selection = $.all(selector);
        selection.then(function(els) {
          if (els.length === 0 && retry) {
            setTimeout(sel, 100);
          }
          else {
            defer.resolve(els);
          }
        });
        selection.thenCatch(function() {
          defer.reject.apply(defer, arguments);
        });
      };

      sel();

      return defer.promise;
    };

    var select = function(selector, eventually) {
      var defer = Q.defer();

      if (eventually) {
        var selection = selectAll(selector, eventually);
        selection.then(function(els) {
          //can't resolve with the el itself because it looks like a promise, and Q deferred will wait on it
          defer.resolve({el: els[0]});
        });
        selection.fail(function() {
          defer.reject.apply(defer, arguments);
        });
      }
      else {
        defer.resolve({el: $(selector)});
      }

      return defer.promise;
    };

    var assertElementExists = function(selector, eventually, done) {
      return selectAll(selector, eventually).then(function(els) {
        if (els.length === 0) {
          throw new Error("Could not find element with selector " + selector);
        } else {
          return done();
        }
      });
    };

    chai.Assertion.addProperty('dom', function() {
      return utils.flag(this, 'dom', true);
    });
    chai.Assertion.addProperty('eventually', function() {
      return utils.flag(this, 'eventually', true);
    });
    chai.Assertion.overwriteMethod('match', function(_super) {
      return function(matcher, done) {
        var self = this;

        if (utils.flag(this, 'dom')) {
          return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {

            return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
              return obj.el.getText().then(function(text) {
                self.assert(matcher.test(text), 'Expected element <#{this}> to match regular expression "#{exp}", but it contains "#{act}".', 'Expected element <#{this}> not to match regular expression "#{exp}"; it contains "#{act}".', matcher, text);
                return typeof done === "function" ? done() : void 0;
              });
            });
          });
        }
        else {
          return _super.call(this, matcher);
        }
      };
    });
    chai.Assertion.addMethod('visible', function(done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test visibility of dom elements');
      }

      var assert = function(condition) {
        self.assert(condition, 'Expected #{this} to be visible but it is not', 'Expected #{this} to not be visible but it is');
        return typeof done === "function" ? done() : void 0;
      };

      var assertDisplayed = function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.isDisplayed().then(function(visible) {
            return assert(visible);
          });
        });
      };

      if (utils.flag(this, 'negate')) {
        return selectAll(this._obj, utils.flag(this, 'eventually')).then(function(els) {
          if (els.length > 0) {
            return assertDisplayed();
          }
          else {
            return assert(els.length > 0);
          }
        });
      }
      else {
        return assertDisplayed();
      }
    });
    chai.Assertion.addMethod('count', function(length, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test count of dom elements');
      }

      return selectAll(this._obj, utils.flag(this, 'eventually')).then(function(els) {
        self.assert(els.length === length, 'Expected #{this} to appear in the DOM #{exp} times, but it shows up #{act} times instead.', 'Expected #{this} not to appear in the DOM #{exp} times, but it does.', length, els.length);
        return typeof done === "function" ? done() : void 0;
      });
    });
    chai.Assertion.addMethod('text', function(matcher, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test text of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getText().then(function(text) {
            if (matcher instanceof RegExp) {
              self.assert(matcher.test(text), 'Expected element <#{this}> to match regular expression "#{exp}", but it contains "#{act}".', 'Expected element <#{this}> not to match regular expression "#{exp}"; it contains "#{act}".', matcher, text);
            }
            else if (utils.flag(self, 'contains')) {
              self.assert(~text.indexOf(matcher), 'Expected element <#{this}> to contain text "#{exp}", but it contains "#{act}" instead.', 'Expected element <#{this}> not to contain text "#{exp}", but it contains "#{act}".', matcher, text);
            }
            else {
              self.assert(text === matcher, 'Expected text of element <#{this}> to be "#{exp}", but it was "#{act}" instead.', 'Expected text of element <#{this}> not to be "#{exp}", but it was.', matcher, text);
            }
            return typeof done === "function" ? done() : void 0;
          });
        });
      });
    });
    chai.Assertion.addMethod('style', function(property, value, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test style of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getCssValue(property).then(function(style) {
            self.assert(style === value, "Expected " + property + " of element <" + self._obj + "> to be '" + value + "', but it is '" + style + "'.", "Expected " + property + " of element <" + self._obj + "> to not be '" + value + "', but it is.");
            return typeof done === "function" ? done() : void 0;
          });
        });
      });
    });
    chai.Assertion.addMethod('value', function(value, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getAttribute('value').then(function(actualValue) {
            self.assert(value === actualValue, "Expected value of element <" + self._obj + "> to be '" + value + "', but it is '" + actualValue + "'.", "Expected value of element <" + self._obj + "> to not be '" + value + "', but it is.");
            return typeof done === "function" ? done() : void 0;
          });
        });
      });
    });
    chai.Assertion.addMethod('disabled', function(done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getAttribute('disabled').then(function(disabled) {
            self.assert(disabled, 'Expected #{this} to be disabled but it is not', 'Expected #{this} to not be disabled but it is');
            return typeof done === "function" ? done() : void 0;
          });
        });
      });
    });
    chai.Assertion.addMethod('htmlClass', function(value, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test value of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getAttribute('class').then(function(classList) {
            self.assert(~classList.indexOf(value), "Expected " + classList + " to contain " + value + ", but it does not.");
            return typeof done === "function" ? done() : void 0;
          });
        });
      });
    });
    return chai.Assertion.addMethod('attribute', function(attribute, value, done) {
      var self = this;

      if (!utils.flag(this, 'dom')) {
        throw new Error('Can only test style of dom elements');
      }

      return assertElementExists(this._obj, utils.flag(this, 'eventually'), function() {
        return select(self._obj, utils.flag(self, 'eventually')).then(function(obj) {
          return obj.el.getAttribute(attribute).then(function(actual) {
            if (typeof value === 'function') {
              done = value;
              self.assert(typeof actual === 'string', "Expected attribute " + attribute + " of element <" + self._obj + "> to exist", "Expected attribute " + attribute + " of element <" + self._obj + "> to not exist");
              return typeof done === "function" ? done() : void 0;
            }
            else {
              self.assert(actual === value, "Expected attribute " + attribute + " of element <" + self._obj + "> to be '" + value + "', but it is '" + actual + "'.", "Expected attribute " + attribute + " of element <" + self._obj + "> to not be '" + value + "', but it is.");
              return typeof done === "function" ? done() : void 0;
            }
          });
        });
      });
    });
  };
};
