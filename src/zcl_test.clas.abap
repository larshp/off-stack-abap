CLASS zcl_test DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
  PUBLIC SECTION.
    "! <p class="shorttext synchronized" lang="de">Adding two numbers</p>
    "! @parameter num1 | First number
    "! @parameter num2 | Second number
    "! @parameter sum  | Sum of NUM1 and NUM2
    CLASS-METHODS add
      IMPORTING
        num1       TYPE i
        num2       TYPE i
      RETURNING
        VALUE(sum) TYPE i.
  PROTECTED SECTION.
  PRIVATE SECTION.
    methods add_test.
ENDCLASS.

CLASS zcl_test IMPLEMENTATION.
  METHOD add.

    " data(cltest) = new zcl_my_test( ).
    " call function 'test_function'.

    sum = num1 + num2.

    " write: / sum.
    " skip.

  ENDMETHOD.

  METHOD add_test.
    write: / 'Test.'.
  ENDMETHOD.

ENDCLASS.