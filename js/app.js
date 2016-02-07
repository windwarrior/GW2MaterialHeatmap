window.$ = window.jQuery = require('jquery');
require('./jquery_promise');
require("babelify-es6-polyfill");

var constants = require("./constants");
var Handlebars = require('handlebars');

var storage = [];

$(function() {
  updateStatus("Creating Base...");
  createMaterialsPromise().then(function(matresult) {
    let item_ids = matresult.reduce(function(a,b) {
      return a.concat(b.items);
    }, []);
    return createItemTPPromise(item_ids).then(function(results) {
      return createItemTransformPromise(results);
    }).then(function(obj) {
      matresult.forEach(category => {
        category.items = category.items.map(itemid => {
          return obj.items.find(x => itemid == x.id);
        });
      });
      let result = [];
      result = obj;
      result["categories"] = matresult;
      return result;
    });
    
  }).then(function(result) {
    createUI(result["categories"]);
    storage = result;
    console.log(storage);
    updateStatus("Ready!");
    
    if (localStorage.getItem("API token")) {
    $("#APIToken").val(localStorage.getItem("API token"));

    $("#token-localstore-info").show();
  } else {
    $("#token-localstore-info").hide();
  }
  });
});

$("#apikey-form").submit(function (event) {
  // lets not post this request
  event.preventDefault();

  // Lets also clear all previous errors
  $("#errors").empty();

  updateStatus("Creating Token...");

  let token = $("#APIToken").val();

  createTokenValidatorPromise(token).then(function (token_info) {
    updateStatus("Creating Account Promise...");
    return createAccountPromise(token_info);
  }).then(function (result) {
    return createItemTransformPromise(result["items"]);
  }).then(function (obj) {
    console.log(obj);
    updateAllColors(obj);

    $('[data-toggle="popover"]').popover()

    $(".item").dblclick(function (event) {
      // we can now exclude this item from our visualisation
      let item = obj.items.find(x => x.id == $(this).data("id"));
      let min = obj.min_value;
      let max = obj.max_value;

      item.disabled = !item.disabled;

      if (item.total_value_sells > 0 && item.total_value_sells <= min) {
        updateAllColors(obj);
      } else if(item.total_value_sells >= max) {
        updateAllColors(obj);
      } else {
        // We can simply update this single item, is a bit less harsh on this device
        updateSingleColor(item, obj.min_value, obj.max_value);
      }

    });
  })
});

function updateStatus(status) {
  $("#status").html(status);
}

// fetches https://api.guildwars2.com/v2/materials?ids=all
function createMaterialsPromise() {
  let materials_info_url = `${constants.API_URL}${constants.MATERIALS_INFO_URL}`;
  return Promise.resolve($.get(materials_info_url));
}

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
    // Set this valid token in the localStorage
    localStorage.setItem("API token", token);
    $("#token-localstore-info").show();

    return result;
  }).then(function (result) {
    return $.extend(result, {'token': token});
  });
}

function createItemTPPromise(item_ids) {
  return Promise.resolve(item_ids).then(function(item_ids) {
    // We shall now chunk the data to get all item descriptions for these items
    let buckets = [];
  
    for (var i = 0; i < item_ids.length; i += 200) {
      let index = Math.floor(i/200);
  
      buckets[index] = item_ids.slice(i, i+200);
    }
  
    return Promise.all(buckets.map(bucket => {
      let ids = bucket;
  
      let item_url = `${constants.API_URL}${constants.ITEMS_URL}?ids=${ids}`;
      let price_url = `${constants.API_URL}${constants.COMMERCE_PRICES_URL}?ids=${ids}`;
      
      let resultbucket = [];
    
      return Promise.all([$.ajax(item_url), $.ajax(price_url)]).then(function (results) {
        results.forEach(function (feature_items) {
          feature_items.forEach(function (feature_item) {
            let item = resultbucket.find(current_item => feature_item.id == current_item.id);
            feature_item["count"] = 0;
            if(item) {
              $.extend(item, feature_item);
            }
            else {
              resultbucket.push(feature_item);
            }
          });
        });
    
        return resultbucket;
      });
    }));
  }).then(function(result){
    return [].concat.apply([], result);
  });
}

function createAccountPromise(token_info) {
  return Promise.resolve(token_info).then(function (token_info) {
    // Now we know that the token indeed has enough permissions
    // we can call the appropriate api's for the materials
    let account_materials_url = `${constants.API_URL}${constants.ACCOUNT_MATERIALS_URL}?access_token=${token_info.token}`;

    return Promise.resolve($.get(account_materials_url));
  }).then(function (material_storage) {
    material_storage.forEach(item => {
      let store_item = storage.items.find(x => x.id == item.id);
      $("#item-"+item.id).find(".item-count").html(item.count);
      store_item["count"] = item.count;
    });
    return storage;
  });
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
    
    storage["min_value"] = min_val;
    storage["max_value"] = max_val;
    storage["items"] = items;
    return storage;
  });
}

function createUI(obj) {
  let tabified = obj;
  
  var source = $("#material-tab-template").html();
  var template = Handlebars.compile(source);

  var context = {tabified: tabified};

  var html = template(context);

  $("#material-storage").html(html);
}

function updateAllColors(obj) {
  updateStatus("Updating Colors...");

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
    updateSingleColor(item, min_val, max_val);
  });

  updateStatus("Done!");
}

function updateSingleColor(item, min_val, max_val) {
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
      s: 100,
      l: 100
    }
  } else {
    let percentage = 1 - ((value - min_val) / (max_val - min_val));

    item["color"] = {
      h: percentage * 180,
      s: 100,
      l: 50
    }
  }

  $("#item-"+item.id+" .item-content").css({'background-color': `hsla(${item.color.h}, ${item.color.s}%, ${item.color.l}%, 0.75)`});
}

Handlebars.registerHelper("formatSimpleGold", function(coin, icons) {
  coin = Math.round(coin);
  var gold   = Math.floor(coin / 10000) % 100;
  var silver = Math.floor(coin / 100) % 100;
  var copper = Math.floor(coin) % 100;

  let res = copper + 'c';

  if (silver > 0) {
    res = silver + 's' + res;
  }

  if (gold > 0) {
    res = gold + 'g' + res;
  }

  return new Handlebars.SafeString(res);
});
