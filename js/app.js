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

  Promise.resolve(token).then(function (token) {
    return token ? Promise.resolve(token) : Promise.reject(Error("You did not provide a token!"));
  }).then(function (token) {
    let token_info_url = `${constants.API_URL}${constants.TOKEN_INFO_URL}?access_token=${token}`;
    return Promise.resolve($.get(token_info_url));
  }).then(function (result) {
    return "permissions" in result && result.permissions.includes("inventories") ? Promise.resolve(result) : Promise.reject(Error("The token you provided doesn't have inventories permission!"));
  }).then(function (token_info) {
    // Now we know that the token indeed has enough permissions
    // we can call the appropriate api's for the materials
    let account_materials_url = `${constants.API_URL}${constants.ACCOUNT_MATERIALS_URL}?access_token=${token}`;

    return Promise.resolve($.get(account_materials_url));
  }).then(function (material_storage) {
    // We shall now chunk the data to get all item descriptions for these items
    let buckets = [];

    console.log(material_storage);

    for (var i = 0; i < material_storage.length; i += 200) {
      let index = Math.floor(i/200);

      buckets[index] = material_storage.slice(i, i+200);
    }

    let promises = buckets.map(bucket => createItemTPPromise(bucket));
    console.log(promises);

    return Promise.all(promises);
  }).then(function (buckets) {
    // Flatten the array again because we don't need to do another API call
    return [].concat.apply([], buckets);
  }).then(function (buckets) {
    buckets.forEach(x => {
      console.log(x.name);

      x["total_value_sells"] = "sells" in x ? x["sells"]["unit_price"] * x["count"] : 0;
      x["total_value_buys"] = "buys" in x ? x["buys"]["unit_price"] * x["count"] : 0;
    });

    return buckets;
  }).then (function (items) {
    // Calculate the minimum and maximum values

    let min_val = items.reduce(function (min, item) {
      return "total_value_sells" in item && item["total_value_sells"] > 0 && min > item["total_value_sells"] ? item["total_value_sells"] : min;
    }, Number.MAX_VALUE)

    let max_val = items.reduce(function (max, item) {
      return "total_value_sells" in item && item["total_value_sells"] > 0 && max < item["total_value_sells"] ? item["total_value_sells"] : max;
    }, Number.MIN_VALUE)

    console.log(`Max value was ${max_val}, min value was ${min_val}`);

    items.forEach(item => {
      let value = "total_value_sells" in item ? item["total_value_sells"] : 0;

      if (value == 0) {
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

      console.log(item);
    });
    return items;

  }).then(function (items) {
    let tabified = items.reduce(function (buckets, item) {
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

    $("#material-storage").append(html);
  }).catch(function (error) {
    var source = $("#error-template").html();
    var template = Handlebars.compile(source);

    var context = {error: error.message}

    var html = template(context);

    $("#errors").append(html);
  })
});


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
