function AjaxError(jqXHR, textStatus, errorThrown) {
  this.name = "AjaxError";
  this.message = textStatus;
  this.jqXHR = jqXHR;
  this.errorThrown = errorThrown;
}
AjaxError.prototype = new Error();
AjaxError.prototype.constructor = AjaxError;

(function($) {
  function decorateAsJQuery(promise) {
    promise.done = function(fn) {
      return decorateAsJQuery(promise.then(fn));
    };
    promise.fail = function(fn) {
      return decorateAsJQuery(promise.then(null, fn));
    };
    promise.complete = function(fn) {
      return decorateAsJQuery(promise.then(fn, fn));
    };
    return promise;
  }
  var jqAjax = $.ajax;
  $.ajax = function ajax() {
    var args = Array.prototype.slice.call(arguments);
    var jqPromise = jqAjax.apply(this, args);
    var promise = new Promise(function(resolve, reject) {
      jqPromise.then(function(data, textStatus, jqXHR) {
        resolve(data);
      }, function(jqXHR, textStatus, errorThrown) {
        reject(new AjaxError(jqXHR, textStatus, errorThrown));
      });
    });
    return decorateAsJQuery(promise);
  };
})(jQuery);
