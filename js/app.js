var $ = window.$ = window.jQuery = require('jquery');
require('./jquery_promise');
require("babelify-es6-polyfill");
require("./array_includes_polyfill");

var constants = require("./constants");
var Handlebars = require('handlebars');

var storage = {};
var icons = {};

$(function() {
  updateStatus("Creating Base...");

  $("#token-localstore-info").hide();

  // Create Toggle button stuff
  $("#tooltip-tgl").bootstrapToggle({
    on: 'Item',
    off: 'Stack',
    size: 'small',
    width: '95px',
  });

  $("#heatmap-tgl").bootstrapToggle({
    on: 'Item',
    off: 'Stack',
    size: 'small',
    width: '95px',
  });

  $("#heatmap-tgl").change(updateAllColors);

  $("#listing-tgl").bootstrapToggle({
    on: 'Buy order',
    off: 'Sell order',
    size: 'small',
    width: '95px',
  });

  $("#listing-tgl").change(updateAllColors);

  $("#listing-tgl").change(updateAllColors);


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
      
      createUI(result["categories"]);
      storage = result;
      updateStatus("Ready!");
      $('#heatmap-btn').prop('disabled', false);
  
      if (localStorage.getItem("API token")) {
        $("#APIToken").val(localStorage.getItem("API token"));
  
        $("#token-localstore-info").show();
        $("#apikey-form").submit();
      }
    });



  }).catch(function (error) {
    var source = $("#error-template").html();
    var template = Handlebars.compile(source);
    var context = { error: error.message };
    var html = template(context);
    $("#errors").append(html);
  });
});

$("#apikey-form").submit(function (event) {
  // lets not post this request
  event.preventDefault();

  // Lets also clear all previous errors
  $("#errors").empty();

  updateStatus("Creating Token...");

  let token = $.trim($("#APIToken").val());
  $("#APIToken").val(token);

  createTokenValidatorPromise(token).then(function (token_info) {
    updateStatus("Creating Account Promise...");
    return createAccountPromise(token_info);
  }).then(function (result) {
    return createItemTransformPromise(result["items"]);
  }).then(function (obj) {
    updateInfo();
    updateAllColors();
  }).catch(function (error) {
    var source = $("#error-template").html();
    var template = Handlebars.compile(source);
    var context = { error: error.message };
    var html = template(context);
    $("#errors").append(html);
    updateStatus("Error!");
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
    localStorage.setItem("API token", $.trim(token));
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
    return item["disabled"] ? sum : sum + item["total_value_buys"];
  }, 0) * 0.85;
  let total_sell = storage.items.reduce(function(sum,item) {
    return item["disabled"] ? sum : sum + item["total_value_sells"];
  }, 0) * 0.85;
  var context = {total_buy: total_buy, total_sell: total_sell};
  var html = template(context);

  $('#infofield').html(html);
  $('#infofield').show();
  $('#helpfield').show();
  
  var catinfosource = $("#cat-info-template").html();
  var cattemplate = Handlebars.compile(catinfosource);
  
  storage.categories.forEach(cat => {
    let cat_buy = cat.items.reduce(function(sum,item) {
      return item["disabled"] ? sum : sum + item["total_value_buys"];
    }, 0) * 0.85;
    let cat_sell = cat.items.reduce(function(sum,item) {
      return item["disabled"] ? sum : sum + item["total_value_sells"];
    }, 0) * 0.85;
    var context = {cat_buy: cat_buy, cat_sell: cat_sell};
    var html = cattemplate(context);
    $("#cat-info-"+cat.id).html(html);
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

function createPopover(item) {
  var source = $("#popover-detail-template").html();
  var template = Handlebars.compile(source);
  if($('#tooltip-tgl').prop('checked')) {
    var context = {value_buys: "buys" in item ? item["buys"]["unit_price"] : 0, value_sells: "sells" in item ? item["sells"]["unit_price"] : 0};
  }
  else {
    var context = {value_buys: item.total_value_buys, value_sells: item.total_value_sells};
  }

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
    container: 'body',
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
    updateInfo();
    if (item.total_value_sells > 0 && item.total_value_sells <= min) {
      updateAllColors();
    } else if(item.total_value_sells >= max) {
      updateAllColors();
    } else {
      // We can simply update this single item, is a bit less harsh on this device
      updateSingleColor(item, storage.min_value, storage.max_value);
    }

  });
}

function updateAllColors() {
  updateStatus("Updating Colors & Info...");
  
  // firstly we need to determine new min and max values
  let min_val = 0;
  let max_val = 0;

  let using = $("#listing-tgl").prop('checked') ?  'buys' : 'sells';


  if($('#heatmap-tgl').prop('checked')) {
    min_val = storage.items.reduce(function (min, item) {
      return !item.disabled && using in item && item[using]["unit_price"] > 0 && item.count > 0 && min > item[using]["unit_price"] ? item[using]["unit_price"] : min;
    }, Number.MAX_VALUE);

    max_val = storage.items.reduce(function (max, item) {
      return !item.disabled && using in item && item[using]["unit_price"] > 0 && item.count > 0 && max < item[using]["unit_price"] ? item[using]["unit_price"] : max;
    }, Number.MIN_VALUE);
  } else {
    min_val = storage.items.reduce(function (min, item) {
      return !item.disabled && `total_value_${using}` in item && item[`total_value_${using}`] > 0 && min > item[`total_value_${using}`] ? item[`total_value_${using}`] : min;
    }, Number.MAX_VALUE);

    max_val = storage.items.reduce(function (max, item) {
      return !item.disabled && `total_value_${using}` in item && item[`total_value_${using}`] > 0 && max < item[`total_value_${using}`] ? item[`total_value_${using}`] : max;
    }, Number.MIN_VALUE);
  }
  storage.min_value = min_val;
  storage.max_value = max_val;

  storage.items.forEach(function (item) {
    updateSingleColor(item, min_val, max_val);
  });

  updateStatus("Done!");
}

function updateSingleColor(item, min_val, max_val) {
  let value = 0;

  let using = $("#listing-tgl").prop('checked') ?  'buys' : 'sells';

  if($('#heatmap-tgl').prop('checked')) {
    value = using in item ? item[using]["unit_price"] : 0;
  } else {
    value = `total_value_${using}` in item ? item[`total_value_${using}`] : 0;
  }

  let percentage = 0;

  if (item.disabled) {
    item["color"] = {h: 0, s: 0, l: 25};
  } else if (value == 0 || item.count == 0) {
    item["color"] = {h: 0, s: 100, l: 100};
  } else {
    percentage = (((value - min_val) / (max_val - min_val))) * 100;
    let logpercentage = Math.log(percentage + 1) / Math.log(Math.pow(101,(1/100)));
<<<<<<< Updated upstream
    console.log(percentage+" => "+logpercentage);
=======
>>>>>>> Stashed changes
    item["color"] = {h: (100-logpercentage) * 1.80, s: 100, l: 50};
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
