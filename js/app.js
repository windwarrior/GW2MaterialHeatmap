window.$ = window.jQuery = require('jquery');
require('./jquery_promise');
require("babelify-es6-polyfill");

var constants = require("./constants");
var Handlebars = require('handlebars');

var storage = {};
var icons = {};

$(function() {
  updateStatus("Creating Base...");

  $("#token-localstore-info").hide();

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
      let result = obj;
      result["categories"] = matresult;
      return result;
    });

  }).then(function(result) {
    
    Promise.resolve($.ajax("https://api.guildwars2.com/v1/files.json")).then(function (fileJson) {
      for (let icon_name of ["ui_coin_gold", "ui_coin_silver", "ui_coin_copper"]) {
        let signature = fileJson[icon_name]["signature"];
        let file_id = fileJson[icon_name]["file_id"];
  
        let gold_icon_location = `https://render.guildwars2.com/file/${signature}/${file_id}.png`;
        icons[icon_name] = `<img class="icon-compact" src="${gold_icon_location}"/>`;
      }
    });
    
    
    createUI(result["categories"]);
    storage = result;
    updateStatus("Ready!");
    $('#heatmap-btn').prop('disabled', false);

    if (localStorage.getItem("API token")) {
      $("#APIToken").val(localStorage.getItem("API token"));

      $("#token-localstore-info").show();
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
    updateInfo();
    updateAllColors(obj);
  });
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

function updateInfo() {
  var source = $("#info-template").html();
  var template = Handlebars.compile(source);
  let total_buy = storage.items.reduce(function(sum,item) {
    return sum + item["total_value_buys"];
  }, 0);
  let total_sell = storage.items.reduce(function(sum,item) {
    return sum + item["total_value_sells"];
  }, 0);
  var context = {total_buy: total_buy, total_sell: total_sell};
  var html = template(context);
  console.log(html);
  $('#infofield').html(html);
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

function createPopover(item) {
  var source = $("#popover-detail-template").html();
  var template = Handlebars.compile(source);

  var context = {item: item};

  var html = template(context);

  return html;
}

function createUI(obj) {
  let tabified = obj;

  var source = $("#material-tab-template").html();
  var template = Handlebars.compile(source);

  var context = {tabified: tabified};

  var html = template(context);

  $("#material-storage").html(html);
  
  $('[data-toggle="popover"]').popover({
      html: true,
      placement: 'auto',
      content: function () {
        return createPopover(storage.items.find(x => x.id == $(this).data("id")));
      }
    });
    
  $(".item").dblclick(function (event) {
    // we can now exclude this item from our visualisation
    let item = storage.items.find(x => x.id == $(this).data("id"));
    let min = storage.min_value;
    let max = storage.max_value;
  
    item.disabled = !item.disabled;
  
    if (item.total_value_sells > 0 && item.total_value_sells <= min) {
      updateAllColors(storage);
    } else if(item.total_value_sells >= max) {
      updateAllColors(storage);
    } else {
      // We can simply update this single item, is a bit less harsh on this device
      updateSingleColor(item, storage.min_value, storage.max_value);
    }

  });
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

Handlebars.registerHelper("formatGold", function(coin) {
  coin = Math.round(coin);
  var gold   = Math.floor(coin / 10000);
  var silver = Math.floor(coin / 100) % 100;
  var copper = Math.floor(coin) % 100;

  let res = `<span>${copper}</span>` + icons.ui_coin_copper;

  if (silver > 0) {
    res = `<span>${silver}</span>` + icons.ui_coin_silver + res;
  }

  if (gold > 0) {
    res = `<span>${gold}</span>` + icons.ui_coin_gold + res;
  }

  return new Handlebars.SafeString('<div class="moneyBox">' + res + '</div>');
});