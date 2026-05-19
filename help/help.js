// help.js — Handles sidebar tab switching

document.querySelectorAll('.menu-item').forEach(function(item) {
  item.addEventListener('click', function() {
    // 1. Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(function(el) {
      el.classList.remove('active');
    });

    // 2. Add active class to clicked item
    item.classList.add('active');

    // 3. Hide all sections
    document.querySelectorAll('.content-section').forEach(function(sec) {
      sec.classList.remove('active');
    });

    // 4. Show corresponding target section
    var targetId = 'sec-' + item.getAttribute('data-target');
    var targetSec = document.getElementById(targetId);
    if (targetSec) {
      targetSec.classList.add('active');
    }
  });
});
