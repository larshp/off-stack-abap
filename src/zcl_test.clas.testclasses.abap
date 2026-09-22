CLASS lcl_test_add DEFINITION FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS:
      test_positive_numbers   FOR TESTING,
      test_negative_numbers   FOR TESTING.
ENDCLASS.

CLASS lcl_test_add IMPLEMENTATION.
  METHOD test_positive_numbers.
    DATA(result) = zcl_test=>add( num1 = 5 num2 = 10 ).
    cl_abap_unit_assert=>assert_equals(
      act = result
      exp = 15
      msg = 'Error adding two positive numbers.' ).
  ENDMETHOD.

  METHOD test_negative_numbers.
    DATA(result) = zcl_test=>add( num1 = -3 num2 = -7 ).
    cl_abap_unit_assert=>assert_equals(
      act = result
      exp = -10
      " exp = -15
      msg = 'Error adding two negative numbers.' ).
  ENDMETHOD.
ENDCLASS.