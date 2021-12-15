// based on https://www.section.io/engineering-education/lru-cache-implementation-in-javascript/


export class LRUCache {

  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map(); // this stores the entire array
    this.clear();
  }

  clear() {
    // this are the boundaries for the double linked list
    this.head = {};
    this.tail = {};

    this.head.next = this.tail; // initialize the double linked list
    this.tail.prev = this.head;
  }

  get(key) {
    const node = this.map.get(key);
    if (node !== undefined) {
      // remove elem from current position
      node.prev.next = node.next;
      node.next.prev = node.prev;

      this.tail.prev.next = node; // insert it after last element. Element before tail
      node.prev = this.tail.prev; // update node.prev and next pointer
      node.next = this.tail;
      this.tail.prev = node; // update last element as tail

      return node.value;
    } else {
      return undefined; // element does not exist
    }
  }

  put(key, value) {
    if (this.get(key) !== undefined) {
      // if key does not exist, update last element value
      // (assert this.tail.prev.key === key)
      this.tail.prev.value = value;
    } else {
      // check if map size is at capacity
      if (this.map.size === this.capacity) {
        //delete item both from map and DLL
        this.map.delete(this.head.next.key); // delete first element of list
        this.head.next = this.head.next.next; // update first element as next element
        this.head.next.prev = this.head;
      }

      const node = {
        value,
        key,
      }; // each node is a hashtable that stores key and value

      // when adding a new node, we need to update both map and DLL
      this.map.set(key, node); // add current node to map
      this.tail.prev.next = node; // add node to end of the list
      node.prev = this.tail.prev; // update prev and next pointers of node
      node.next = this.tail;
      this.tail.prev = node; // update last element
    }
  }

  _dllLength() {
    // the result of this function must match this.map.size;
    let first = this.head.next;
    let count = 0;
    let node = first.next;
    while (node !== undefined) {
      count++;
      node = node.next;
    }
    return count;
  }

}
