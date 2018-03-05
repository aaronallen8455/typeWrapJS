var _t = (function() {
    
    // primitives
    var primitives = {
        int: function(x) {
            if (typeof x !== "number") return false;

            return x.toString().indexOf('.') === -1;
        },

        double: function(x) {
            return typeof x === "number";
        },

        string: function(x) {
            return typeof x === "string";
        },

        bool: function(x) {
            return typeof x === "boolean";
        },
    };

    // set the type identifier string
    for (var key in primitives) {
        primitives[key]._type = key;
    }

    // return the wrapper function
    return function() {
        var args = arguments,
            checkers = [];

        // create the array of type checkers for arguments
        for (var i=0; i<args.length; i++) {
            checkers.push(getTypeChecker(args[i]));
        }
        
        // return the functions type signature wrapper
        return typeSigWrapper(checkers);
    };
    
    // get the type checker for a given Type
    function getTypeChecker(arg) {
        // check if it's a primitive
        if (typeof arg === "string") {
            arg = arg.toLowerCase();
            var check = primitives[arg];
    
            // throw error if no match found
            if (check === undefined) {
                throw EvalError("There is no primitive type matching '" + arg + "'. " + getCallerLine());
            }
            
            return check;
        }
    
        // check if it's a type signature
        if (arg instanceof TypeSig) {
            function check(func) {
            	  var typeSig = func._typeWrapper;
                
                if (!(typeSig instanceof TypeSig)) {
                    return false;
                }

                if (typeSig.typeCheckers.length !== arg.typeCheckers.length) {
                    return false;
                }

                for (var i=0; i<arg.typeCheckers.length; i++) {
                    var checkerA = arg.typeCheckers[i],
                        checkerB = typeSig.typeCheckers[i];

                    if (checkerA._type !== checkerB._type) {
                        return false;
                    }
                    // recurse if checking a typeSig checker
                    if (checkerA._type === 'typesig') {
                        if (!check(checkerA, checkerB)) return false;
                    }
                }

                if (arg.returnTypeChecker) {
                    if (typeSig.returnTypeChecker === null) return false;

                    if (typeSig.returnTypeChecker._type !== arg.returnTypeChecker._type) return false;
                } else if (typeSig.returnTypeChecker) return false;

                return true;
            }

            check._type = "TypeSig";
            return check
        }

        if (arg instanceof Array) {
            return new ArrayType(arg[0]).typeChecker;
        }

        if (typeof arg === "function") {
            return new ObjectType(arg).typeChecker;
        }

        // check for arrays
        if (arg instanceof ArrayType) {
            return arg.typeChecker;
        }

        // check for objects
        if (arg instanceof ObjectType) {
            return arg.typeChecker;
        }

        // return the default checker if nothing matched
        function checker(x) { return arg === x }
        checker._type = "(default)";

        return checker;
    }

    // create a type model for an object given it's constructor function
    function ObjectType(constructor) {
        if (typeof constructor !== "function") throw TypeError("Parameter must be a constructor function.");

        this.typeChecker = function(obj) {
            return obj instanceof constructor;
        }
        this.typeChecker._type = extractClassName(constructor);
    }

    // extracts a class name from a given constructor function
    function extractClassName(constructor) {
        var str = constructor.toString();
        var startInd = str.indexOf(' ');
        var endInd = str.indexOf('(');
        return str.slice(startInd + 1, endInd);
    }

    // create a type model for an array of the given item type
    function ArrayType(itemType) {
        if (itemType == null) throw TypeError("Cannot construct ArrayType from empty array.");

        var itemTypeChecker = getTypeChecker(itemType);
        this.typeChecker = function(arr) {
            if (!(arr instanceof Array)) return false;
            
            for (var i=0; i<arr.length; i++) {
                // skip item if array is sparse
                if (arr[i] === null || arr[i] === undefined) continue;

                if (!itemTypeChecker(arr[i])) return false;
            }
            return true;
            
        }

        this.typeChecker._type = 'array[' + itemTypeChecker._type + ']';
    }

    // a dummy constructor used in type checking
    function TypeSig() {}

    // returns a type safe version of a function given an array of type checkers
    function typeSigWrapper(checkers) {
        function wrapper(func) {
            function wrapped() {
                var args = arguments;
    
                // check if correct number of args was passed
                if (args.length !== checkers.length) {
                    throw TypeError("Function called with the wrong number of arguments. " + getCallerLine());
                }
    
                // apply a checker to each argument
                for (var i=0; i<args.length; i++) {
                    if (!checkers[i](args[i])) {
                        throw TypeError("Invalid type passed for argument " + (i + 1) + ". " + getCallerLine());
                    }
                }
    
                // call the function
                var result = func.apply(null, args);
    
                if (wrapper.returnTypeChecker !== null && !wrapper.returnTypeChecker(result)) {
                    throw TypeError("Function returned a different type than expected. " + getCallerLine());
                }
    
                return result;
            }
            
            wrapped._typeWrapper = wrapper;
            
            return wrapped;
        }

        wrapper.typeCheckers = checkers;
        wrapper.returnTypeChecker = null;

        // function for setting the expected return type
        wrapper.ret = function(value) {
            if (wrapper.returnTypeChecker !== null) {
                throw SyntaxError("Return value can only be set once. " + getCallerLine());
            }
            wrapper.returnTypeChecker = getTypeChecker(value);
            return wrapper;
        }

        // make wrapper an instance of TypeSig
        Object.setPrototypeOf(wrapper, new TypeSig());

        return wrapper;
    }

    function getCallerLine() {
        return (new Error()).stack.split("\n")[2];
    }
})();