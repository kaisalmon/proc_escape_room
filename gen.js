var items = require("./items.json")
var puzzles = require("./puzzles.json")
var _ = require('./lodash.core.js');

var items_by_tag = sort_by_tag(items);
var puzzles_by_output = sort_by_tag(puzzles, "outputs");
var puzzles_by_input = sort_by_tag(puzzles, "inputs");


function sort_by_tag(arr, prop_name){
  prop_name = prop_name === undefined
              ? "tags"
              : prop_name
  let result = {};
  for(let i in arr){
    let obj = arr[i]
    let tag_arr = obj[prop_name];
    if(tag_arr === undefined || tag_arr.length == 0){
      tag_arr = ["NONE"];
    }
    for(let j in tag_arr){
      let tag = tag_arr[j]
      if(result[tag] === undefined){
        result[tag] = []
      }
      result[tag].push(obj);
    }
  }
  return result;
}

function remove_item_from_pool(item){
  if(item.max && item.max > 1){
    item.max--
    return
  }

  items.splice(items.indexOf(item), 1)
  for(let t in items_by_tag){
    if(items_by_tag[t].indexOf(item) > -1)
      items_by_tag[t].splice(items_by_tag[t].indexOf(item), 1)
  }
}
function remove_puzzle_from_pool(puzzle){
  if(puzzle.max && puzzle.max > 1){
    puzzle.max--
    return
  }

  puzzles.splice(puzzles.indexOf(puzzle), 1)
  for(let t in puzzles_by_input){
    if(puzzles_by_input[t].indexOf(puzzle)>-1)
      puzzles_by_input[t].splice(puzzles_by_input[t].indexOf(puzzle), 1)
  }
  for(let t in puzzles_by_output){
    if(puzzles_by_output[t].indexOf(puzzle)>-1)
      puzzles_by_output[t].splice(puzzles_by_output[t].indexOf(puzzle), 1)
  }
}


function EscapeRoom(){
  this.nodes = [];
  this.dangling_nodes = [];
  this.items_by_name = {};
  this.puzzles_by_name = {};
}

EscapeRoom.prototype.get_dangling_inputs = function(){
  var inputs = this.dangling_nodes.map(x=> x.inputs || [])
  return [].concat.apply([], inputs);
}

EscapeRoom.prototype.get_puzzles_from_output_item = function(item, child_puzzle){
  let result = []
  for(let i in item.tags){
    let tag = item.tags[i]

    for(let j in this.nodes){
      let puzzle = this.nodes[j]
      if(this.dangling_nodes.indexOf(puzzle) !== -1
      && puzzle != child_puzzle
      && (puzzle.max_optional === undefined || puzzle.max_optional > 0)){
        if(puzzle.optional_outputs && puzzle.optional_outputs.indexOf(tag) !== -1){
          result.push(puzzle)
        }
      }
    }
    for(let j in puzzles_by_output[tag]){
      let puzzle =  puzzles_by_output[tag][j]
      if(result.indexOf(puzzle) === -1){
        result.push(puzzle)
      }
    }
  }

  if(this.nodes.length > MAX_PUZZLES){
    let filtered_result = result.filter((n)=>n.used_in_room || n.inputs ===undefined || n.inputs.length ==  0)
    console.log("Too big, better filter out things which increase size")
    if(filtered_result.length > 0){
      return filtered_result
    }
  }

  if(this.nodes.length < MIN_PUZZLES){
    let filtered_result = result.filter((n)=>
      !n.used_in_room && n.inputs && n.inputs.length > 0
    )
    console.log("Too small, better filter out things which don't increase size")
    if(filtered_result.length > 0){
      return filtered_result
    }
  }

  return result
}

EscapeRoom.prototype.to_dotviz = function(){

  let item_style = "[shape=diamond fontsize=8 margin=0.03]"
  let dangling_style = "[color=red fontcolor=red]"

  let result = ""
  result+="digraph G { node [shape=box];"
  if(this.nodes.filter(n => !n.inputs || n.inputs.length == 0).length > 0){
    result+= "start[shape=doublecircle];"
  }
  for(let i in this.nodes){
    let n = this.nodes[i]
    if(!n.inputs || n.inputs.length == 0){
      result+= "start-> \""+n.name+"\";"
    }
    let style = this.dangling_nodes.indexOf(n) === -1
                ? ""
                : dangling_style
    result+= '"'+n.name+'"'+style+';'
    for(let j in n.input_items){
      let item = n.input_items[j]
      result += '"'+item.name+"\""+item_style+';'
      result += '"'+item.name+'" -> "'+n.name+'";'
    }
    for(let j in n.output_items){
      let item = n.output_items[j]
      result += '"'+n.name+'" -> "'+item.name+'";'
    }
  }
  result+="}"
  result=result.replace(/;/g,";\n")
  return result
}

EscapeRoom.prototype.fix_dangling_node = function(n){
  if(this.dangling_nodes.indexOf(n)===-1){
    throw "Node not in dangling nodes!!"
  }

  let inputs = n.inputs;
  for(let i in inputs){
    let puzzle_options = []
    let tag = inputs[i]
    let possible_items = typeof(tag) == "string"
                         ?items_by_tag[tag]
                         : [tag]
     if(possible_items.length==0){
       throw "No items have the tag "+tag
     }
    for(let j in possible_items ){
      let item = possible_items[j]
      let outputs = this.get_puzzles_from_output_item(item, n)
      for(let k in outputs){
        let puzzle = outputs[k]
        puzzle_options.push({
          "puzzle": puzzle,
          "item": item
        })
      }
    }
    let selection = puzzle_options[Math.floor(Math.random()*puzzle_options.length)]
    if(!selection){
      throw "No way to fix dangling puzzle "+n.name
    }
    remove_item_from_pool(selection.item)
    remove_puzzle_from_pool(selection.puzzle)

    //Is this a puzzle that's from the list of puzzle_option
    // Or is it a specific in room puzzle
    let puzzle = selection.puzzle.used_in_room
                ? selection.puzzle
                : _.clone(selection.puzzle)

    if(selection.item){

      if(!puzzle.output_items){
        puzzle.output_items = []
      }

      let item = _.clone(selection.item)
      puzzle.output_items.push(item)
      if(!n.input_items){
        n.input_items = []
      }
      n.input_items.push(item)

      if(this.items_by_name[item.name] === undefined){
        this.items_by_name[item.name] = []
      }
      this.items_by_name[item.name].push(item);
      if(this.items_by_name[item.name].length > 1){
        item.name += " № "+(this.items_by_name[item.name].length)
      }

    }

    if(puzzle.used_in_room){
      if(puzzle.max_optional){
        puzzle.max_optional--;
      }
    }else{
      if(this.puzzles_by_name[puzzle.name] === undefined){
        this.puzzles_by_name[puzzle.name] = []
      }
      this.puzzles_by_name[puzzle.name].push(puzzle);
      if(this.puzzles_by_name[puzzle.name].length > 1){
        puzzle.name += " № "+(this.puzzles_by_name[puzzle.name].length)
      }
      this.nodes.push(puzzle)
      puzzle.used_in_room = true
      if(puzzle.inputs && puzzle.inputs.length > 0){
        this.dangling_nodes.push(puzzle)
      }
    }
  }
  this.dangling_nodes.splice(this.dangling_nodes.indexOf(n),1)
}


let MIN_PUZZLES = 6
let MAX_PUZZLES = 12
let room = new EscapeRoom();
let door = {name:"Final Door", inputs:["key", "signal"]}
room.nodes.push(door)
room.dangling_nodes.push(door)
try{
  var viz = new Viz();
  while(room.dangling_nodes.length > 0){
    let index = Math.floor(Math.random()*room.dangling_nodes.length)
    room.fix_dangling_node(room.dangling_nodes[index])

    viz.renderSVGElement(room.to_dotviz())
    .then(function(element) {
      document.body.appendChild(element);
    });
  }

}catch(e){
  console.error(e)
}
