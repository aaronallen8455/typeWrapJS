var _t = (function() {
    
    // primitive type checkers
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

    // the main exported function. Builds a function type signature from the given type arguments
    function typeSigBuilder() {
        var args = arguments,
            checkers = [];

        if (!typeSigBuilder.disabled) {
            // create the array of type checkers for arguments
            for (var i=0; i<args.length; i++) {
                checkers.push(getTypeChecker(args[i]));
            }
        }
        
        // return the functions type signature wrapper
        return typeSigWrapper(checkers);
    }

    // returns a type model for the given object
    typeSigBuilder.o = function(value) {
        if (typeof value !== "object") {
            throw TypeError('Argument must be of type Object. ' + getCallerLine());
        }

        if (!value.constructor) {
            throw TypeError('Object does not have a constructor. ' + getCallerLine());
        }

        return new ObjectType(value.constructor);
    };

    // allows for disabling type checking
    typeSigBuilder.disabled = false;

    return typeSigBuilder;
    
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

                // check that argument types match
                function compareCheckers(typeA, typeB) {
                    if (typeA.typeCheckers.length !== typeB.typeCheckers.length) {
                        return false;
                    }
                    
                    for (var i=0; i<typeA.typeCheckers.length; i++) {
                        var checkerA = typeA.typeCheckers[i],
                            checkerB = typeB.typeCheckers[i];
                            
                        if (checkerA._type !== checkerB._type) {
                            return false;
                        }
                        // recurse if checking a typeSig checker
                        if (checkerA._type === 'TypeSig') {
                            if (!compareCheckers(checkerA._boundTypeSig, checkerB._boundTypeSig)) return false;
                        }
                    }
                    // check that return types match
                    if (typeA.returnTypeChecker) {
                        if (typeB.returnTypeChecker === null) return false;
    
                        if (typeB.returnTypeChecker._type !== typeA.returnTypeChecker._type) return false;
    
                        if (typeB.returnTypeChecker._type === "TypeSig") {
                            // recursively check the return types
                            if (!compareCheckers(typeA.returnTypeChecker._boundTypeSig, typeB.returnTypeChecker._boundTypeSig)) return false;
                        }
                    } else if (typeB.returnTypeChecker) return false;
    
                    return true;
                }

                return compareCheckers(arg, typeSig);
            }

            check._type = "TypeSig";
            check._boundTypeSig = arg; // keep a reference back to the TypeSig for recursive argument checking against another typeSig checker
            return check
        }

        // wrap array primitive
        if (arg instanceof Array) {
            return new ArrayType(arg[0]).typeChecker;
        }

        // wrap constructor functions
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
        checker._type = arg.toString();

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
    
                if (typeSigBuilder.disabled) {
                    // don't perform any checks if disabled
                    return func.apply(null, args);
                }

                // check if correct number of args was passed
                if (args.length !== checkers.length) {
                    throw TypeError("Function called with the wrong number of arguments. " + getCallerLine());
                }
    
                // apply checkers to arguments
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

    // utility to get info about where an exception was thrown from.
    function getCallerLine() {
        return (new Error()).stack.split("\n")[2];
    }
})();

// for use with nodeJS
if (typeof module !== 'undefined') {
    module.exports = _t;
}