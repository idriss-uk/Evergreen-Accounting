module.exports = {
  content: ['./index.html', './js/**/*.js'],
  darkMode: 'class',
  safelist: ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4'],
  theme: { extend: { colors: { brand: {50:'#F5F7F0',100:'#E7ECD9',500:'#718355',600:'#556B2F',700:'#3F5223',900:'#243020'}, emeraldCustom:'#10b981', roseCustom:'#f43f5e' } } },
  plugins: []
};
