
class Message {
  constructor(from, text) {
    this.from = from;
    this.text = text;
    this.timestamp = new Date();
  }
}

module.exports = Message;
