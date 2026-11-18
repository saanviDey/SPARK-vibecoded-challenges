We are going to build a visualization for merge sort. Merge sort follows the divide-and-conquer approach by recursively dividing the input array into two halves, recursively sorting sorting the two halves, and finally merging them back together to get the sorted final array.

Here's a step-by-step explanation of how merge sort works:

1. Divide: Divide the list or array recursively into two halves until it can no more be divided.
2. Conquer: Each subarray is sorted individually using the merge sort algorithm.
3. Merge: The sorted subarrays are merged back together in sorted order. The process continues until all elements from both subarrays have been merged.

As an example, let's sort the [38, 27, 43, 10] using Merge Sort

Divide:
[38, 27, 43, 10] is divided into [38, 27] and [43, 10]
[38, 27] is divided into [38] [27]
[43, 10] is divided into [43] [10]

Conquer:
[38] is already sorted
[27] is already sorted
[43] is already sorted
[10] is already sorted

Merge:
Merge [38] and [27] to get [27, 38] 
Merge [43] and [10] to get [10,43] 
Merge [27, 38] and [10, 43] to get the final sorted list [10, 27, 38, 43]

One scenario to keep in mind of is an odd-numbered list. The same steps should be applied. Here is an example:
[5, 4, 3, 2, 1]

Divide:
[5, 4, 3, 2, 1] is divided into [5, 4, 3] and [2, 1]
[5, 4, 3] is divided into [5, 4] and [3]
[5, 4] is divided into [5] and [4]
[2, 1] is divided into [2] [1]

Conquer:
[5] is already sorted
[4] is already sorted
[3] is already sorted
[2] is already sorted
[1] is already sorted

Merge:
Merge [5] and [4] to get [4, 5]
Merge [3] and [2] to get [2, 3]
Merge [2, 3] with [1] to get [1, 2, 3]
Merge [4, 5] with [1, 2, 3] to get [1, 2, 3, 4, 5]

Sorted scenario: [2, 4, 6, 8, 10, 12]

Divide:
[2, 4, 6, 8, 10, 12] is divided to [2, 4, 6] and [8, 10, 12]
[2, 4, 6] is divided to [2, 4] and [6]
[2, 4] is divided to [2] and [4]
[8, 10, 12] is divided to [8, 10] and [12]
[8, 10] is divided to [8] [10]

Conquer:
[2] is already sorted
[4] is already sorted
[6] is already sorted
[8] is already sorted
[10] is already sorted
[12] is already sorted

Merge:
Merge [2] and [4] to get [2, 4]
Merge [6] and [8] to get [6, 8]
Merge [2, 4] and [6, 8] to get [2, 4, 6, 8]
Merge [10] and [12] to get [10, 12]
Merge [2, 4, 6, 8] and [10, 12] to get [2, 4, 6, 8, 10, 12]
