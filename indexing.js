/*
 indexing.js - V0.000
 Sven Nilsen, 2013
 
 This library adds additional functions to arrays that makes them useful
 for dealing with sorted indexing.
 */

// This function takes two lists of sorted indices and merges them.
// Duplicates are removed.
Array.prototype.or = function(b) {
	var a = this;
	var c = [];
	var max = 9007199254740992;
	var na = a.length;
	var nb = b.length;
	for (var i = 0, j = 0; i < na || j < nb;) {
		var pa = i < na ? a[i] : max;
		var pb = j < nb ? b[j] : max;
		var min = pa < pb ? pa : pb;
		if (pa == min) i++;
		if (pb == min) j++;
		
		c.push(min);
	}
	return c;
}

// This function takes two lists of sorted indices and returns indices
// that are in both lists.
Array.prototype.and = function(b) {
	var a = this;
	var c = [];
	var max = 9007199254740992;
	var na = a.length;
	var nb = b.length;
	for (var i = 0, j = 0; i < na && j < nb;) {
		var pa = i < na ? a[i] : max;
		var pb = j < nb ? b[j] : max;
		var min = pa < pb ? pa : pb;
		if (pa == min) i++;
		if (pb == min) j++;
		if (pa == pb) c.push(min);
	}
	return c;
}

// This function takes two lists of sorted indices and returns
// a list containing indices from the first but not from the second.
Array.prototype.except = function(b) {
	var a = this;
	var c = [];
	var max = 9007199254740992;
	var na = a.length;
	var nb = b.length;
	for (var i = 0, j = 0; i < na;) {
		var pa = i < na ? a[i] : max;
		var pb = j < nb ? b[j] : max;
		var min = pa < pb ? pa : pb;
		if (pa == min) i++;
		if (pb == min) j++;
		if (pb != min) c.push(min);
	}
	return c;
}

// This search returns the negative index of larger item minus one
// if the item is not found.
// For example, if 0 is higher, it returns -1.
Array.prototype.binarySearch = function(find) {
	var low = 0, high = this.length, i, comparison;
	while (low < high) {
		i = Math.floor((low + high - 1) / 2);
		if (this[i] < find) { low = i + 1; continue; };
		if (this[i] > find) { high = i; continue; };
		return i;
	}
	return -high - 1;
};

// Inserts item as sorted in the array using binary search.
Array.prototype.insertSorted = function(item) {
	var ind = this.binarySearch(item);
	
	if (ind >= 0) return;
	
	ind = -(ind + 1);
	this.splice(ind, 0, item);
}
