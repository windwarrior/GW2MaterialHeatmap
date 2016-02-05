window.$ = window.jQuery = require('jquery');
require('./jquery_promise');
require("babelify-es6-polyfill");

var constants = require("./constants");
var Handlebars = require('Handlebars');

$("#apikey-form").submit(function (event) {
  // lets not post this request
  event.preventDefault();

  // Lets also clear all previous errors
  $("#errors").empty();


  let token = $("#APIToken").val();

  createTokenValidatorPromise(token).then(function (token_info) {
    return createAccountPromise(token_info);
  }).then(function (items) {
    return createItemTransformPromise(items);
  }).then(function (obj) {
    let items = obj.items;

    $("#material-storage").append(createUI(obj));

    updateAllColors(obj);

    $(".item").dblclick(function (event) {
      // we can now exclude this item from our visualisation

      let item = obj.items.find(x => x.id == $(this).data("id"));
      let min = obj.min_value;
      let max = obj.max_value;

      console.log(`${min} <= ${item.total_value_sells} <= ${max}`);


      item.disabled = !item.disabled;

      if (item.total_value_sells > 0 && item.total_value_sells <= min) {
        console.log("Dat was de goedkoopste :'(");
        updateAllColors(obj);
      } else if(item.total_value_sells >= max) {
        console.log("Dat was de duurste :'(");
        updateAllColors(obj);
      } else {
        // We can simply update this single item, is a bit less harsh on this device
        $("#item-"+item.id+" .item-content").css({'background-color': 'hsla(0, 0%, 50%, 0.75)'});
      }


    });
  }).catch(function (error) {
    console.log(error);

    var source = $("#error-template").html();
    var template = Handlebars.compile(source);

    var context = {error: error.message}

    var html = template(context);

    $("#errors").append(html);
  })
});

/* Creates a promise that will check everything related to the token

@param token: The token that should be checked
*/
function createTokenValidatorPromise(token) {
  return Promise.resolve(token).then(function (token) {
    return token ? Promise.resolve(token) : Promise.reject(Error("You did not provide a token!"));
  }).then(function (token) {
    let token_info_url = `${constants.API_URL}${constants.TOKEN_INFO_URL}?access_token=${token}`;
    return Promise.resolve($.get(token_info_url));
  }).then(function (result) {
    return "permissions" in result && result.permissions.includes("inventories") ? Promise.resolve(result) : Promise.reject(Error("The token you provided doesn't have inventories permission!"));
  }).then(function (result) {
    return $.extend(result, {'token': token});
  });
}

function createItemTPPromise(items) {
  let ids = items.map(elem => elem.id).join(",");

  let item_url = `${constants.API_URL}${constants.ITEMS_URL}?ids=${ids}`;
  let price_url = `${constants.API_URL}${constants.COMMERCE_PRICES_URL}?ids=${ids}`;

  return Promise.all([$.ajax(item_url), $.ajax(price_url)]).then(function (results) {
    results.forEach(function (feature_items) {
      feature_items.forEach(function (feature_item) {
        let item = items.find(current_item => feature_item.id == current_item.id);

        $.extend(item, feature_item);
      })
    });

    return items;
  });
}

function createAccountPromise(token_info) {
  return Promise.resolve(token_info).then(function (token_info) {
    // Now we know that the token indeed has enough permissions
    // we can call the appropriate api's for the materials
    let account_materials_url = `${constants.API_URL}${constants.ACCOUNT_MATERIALS_URL}?access_token=${token_info.token}`;

    return Promise.resolve($.get(account_materials_url));
  }).then(function (material_storage) {
    // We shall now chunk the data to get all item descriptions for these items
    let buckets = [];

    for (var i = 0; i < material_storage.length; i += 200) {
      let index = Math.floor(i/200);

      buckets[index] = material_storage.slice(i, i+200);
    }

    let promises = buckets.map(bucket => createItemTPPromise(bucket));

    return Promise.all(promises);
  }).then(function (buckets) {
    // Flatten the array again because we don't need to do another API call
    return [].concat.apply([], buckets);
  })
}

function createItemTransformPromise(items) {
  return Promise.resolve(items).then(function (items) {
    items.forEach(x => {
      x["disabled"] = false;

      x["total_value_sells"] = "sells" in x ? x["sells"]["unit_price"] * x["count"] : 0;
      x["total_value_buys"] = "buys" in x ? x["buys"]["unit_price"] * x["count"] : 0;
    });

    return items;
  }).then (function (items) {
    let min_val = items.reduce(function (min, item) {
      return "total_value_sells" in item && item["total_value_sells"] > 0 && min > item["total_value_sells"] ? item["total_value_sells"] : min;
    }, Number.MAX_VALUE)

    let max_val = items.reduce(function (max, item) {
      return "total_value_sells" in item && item["total_value_sells"] > 0 && max < item["total_value_sells"] ? item["total_value_sells"] : max;
    }, Number.MIN_VALUE)

    return {
      "min_value": min_val,
      "max_value": max_val,
      "items": items
    }
  });
}

function createUI(obj) {
  let tabified = obj.items.reduce(function (buckets, item) {
    let tab = buckets.find(x => x.category == item.category);

    if (tab) {
      tab.items.push(item);
    } else {
      buckets.push({category: item.category, items: [item]});
    }

    return buckets;
  }, []);

  var source = $("#material-tab-template").html();
  var template = Handlebars.compile(source);

  var context = {tabified: tabified};

  var html = template(context);

  return html;
}

function updateAllColors(obj) {
  // firstly we need to determine new min and max values
  let min_val = obj.items.reduce(function (min, item) {
    return !item.disabled && "total_value_sells" in item && item["total_value_sells"] > 0 && min > item["total_value_sells"] ? item["total_value_sells"] : min;
  }, Number.MAX_VALUE);

  let max_val = obj.items.reduce(function (max, item) {
    return !item.disabled && "total_value_sells" in item && item["total_value_sells"] > 0 && max < item["total_value_sells"] ? item["total_value_sells"] : max;
  }, Number.MIN_VALUE);

  obj.min_value = min_val;
  obj.max_value = max_val;

  obj.items.forEach(function (item) {
    let value = "total_value_sells" in item ? item["total_value_sells"] : 0;

    if (item.disabled) {
      item["color"] = {
        h: 0,
        s: 0,
        l: 25
      }
    } else if (value == 0 || ("disabled" in item && item.disabled)) {
      item["color"] = {
        h: 0,
        s: 0,
        l: 50
      }
    } else {
      let percentage = 1 - ((value - min_val) / (max_val - min_val));

      item["color"] = {
        h: percentage * 180,
        s: 100,
        l: 50
      }
    }

    console.log("updating color!");
    console.log(`hsla(${item.color.h}, ${item.color.s}%, ${item.color.l}%, 0.75)`);

    $("#item-"+item.id+" .item-content").css({'background-color': `hsla(${item.color.h}, ${item.color.s}%, ${item.color.l}%, 0.75)`});
  });

}
