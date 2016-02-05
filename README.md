# Installation
Install all dependencies:
```
npm install babel-preset-es2015 babelify babelify-es6-polyfill babelify browserify handlebars jquery watchify
```

# Hacking
Modify any file within the JS folder (do not alter bundle.js) and recompile bundle.js using:
```
browserify js/app.js -t babelify -o bundle.js
```

During development you might want to automatically recompile the bundle using:
```
watchify js/app.js -t babelify -o bundle.js
```
